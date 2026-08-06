"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { CoachMark } from "@/components/tour/coach-mark";
import { easeOutExpo } from "@/components/motion/primitives";
import { trapTab } from "@/lib/a11y/focus-trap";
import {
  placeTooltip,
  rectsEqual,
  type Placement,
  type Rect,
} from "@/lib/tour/geometry";
import { reconcileTour } from "@/lib/tour/machine";
import {
  STEP_BY_ANCHOR,
  TOUR_ROUTES,
  TOUR_STEPS,
  TOUR_STEP_COUNT,
} from "@/lib/tour/steps";
import {
  endTour,
  goToStep,
  nextStep,
  prevStep,
  startTour,
  useTourBlocked,
  useTourState,
} from "@/lib/tour/store";
import { resolveTourTarget, waitForTourTarget } from "@/lib/tour/target";

/**
 * The guided tour overlay. Mounted once, in the ROOT layout's <body>, as a
 * sibling after {children}.
 *
 * That mount point is load-bearing. (shell)/template.tsx remounts its subtree
 * on every shell navigation and animates opacity (creating a stacking context),
 * and map-canvas.tsx wraps Leaflet in `isolate` - anything rendered inside
 * either would die between steps or be z-capped below the map. As a body-level
 * sibling with no transformed ancestor, this shares a coordinate space with the
 * position:fixed navs it measures.
 *
 * Everything positional is keyed by step index rather than reset on change, so
 * no effect ever has to synchronously setState to clear stale geometry.
 *
 * z-index ladder, for whoever adds the next overlay:
 *   nav 40 · misc 50 · map overlays 400-600 · sheets 1000 · auth gate 1100 ·
 *   tour 1200
 */

/** Breathing room between the spotlight ring and the element it frames. */
const PAD = 6;
/** How long a surface gets to paint its nav before we give up on the step. */
const TARGET_TIMEOUT_MS = 4000;
/** Let the surface settle before an unprompted tour takes over the screen. */
const AUTOSTART_DELAY_MS = 700;
/**
 * How many steps may fail to find their target before the tour gives up for
 * good. Each step gets a retry of its own first, so this is three steps that
 * genuinely have no nav rather than three slow frames. An undismissable broken
 * tour is worse than one that quietly stops - but retiring the feature for a
 * member over one unlucky render is worse than either.
 */
const MISS_BUDGET = 3;

/** Clicking the dim must not steal focus out of the panel. */
function swallowFocus(event: { preventDefault: () => void }) {
  event.preventDefault();
}

export function TourHost() {
  const state = useTourState();
  const blocked = useTourBlocked();
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  const titleId = useId();
  const bodyId = useId();

  const panelRef = useRef<HTMLDivElement>(null);
  const topInsetRef = useRef<HTMLSpanElement>(null);
  const bottomInsetRef = useRef<HTMLSpanElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  /** The route this host is currently pushing to, so a member-driven
   *  navigation can be told apart from our own. */
  const expectedRef = useRef<string | null>(null);
  /** The pathname at the previous reconcile. This is what lets the machine
   *  tell "we advanced the step" from "they navigated" - see lib/tour/machine. */
  const lastPathRef = useRef<string | null>(null);
  /** Whether any step has actually been shown yet. Distinguishes "the tour
   *  just launched somewhere else, get me to step 0" from "the member wandered
   *  off mid-tour" - the two look identical from pathname alone. */
  const hasShownRef = useRef(false);
  const missesRef = useRef(0);
  /** The step whose free retry has already been spent. */
  const retriedRef = useRef(-1);
  const rafRef = useRef(0);
  /** Bumped to re-run the step effect for a second look at a missing target. */
  const [retryTick, setRetryTick] = useState(0);

  /** Where the spotlight sits, and which step put it there. */
  const [anchor, setAnchor] = useState<{ step: number; rect: Rect } | null>(
    null,
  );
  /** Where the panel sits, and which step it was computed for. */
  const [placed, setPlaced] = useState<{
    step: number;
    placement: Placement;
  } | null>(null);

  const running = state.status === "running";
  const stepIndex = state.step;
  const step = TOUR_STEPS[stepIndex];

  // --- measuring -----------------------------------------------------------

  const measure = useCallback(() => {
    const panel = panelRef.current;
    const current = TOUR_STEPS[stepIndex];
    if (!panel || !current) return;

    const hit = resolveTourTarget(current.target);
    if (!hit) return;

    setAnchor((prev) =>
      prev && prev.step === stepIndex && rectsEqual(prev.rect, hit.rect)
        ? prev
        : { step: stepIndex, rect: hit.rect },
    );

    // --safe-top and --tab-clearance are calc()/env() values;
    // getComputedStyle().getPropertyValue() hands back the unresolved token,
    // so two 1px spans that actually lay out are the only honest reading.
    const insets = {
      top: topInsetRef.current?.offsetHeight ?? 0,
      bottom: bottomInsetRef.current?.offsetHeight ?? 0,
      left: 0,
      // --rail-w is deliberately NOT a left inset: on lg the rail IS the
      // target, and insetting past it would fight the placement we want.
      right: 0,
    };

    const panelRect = panel.getBoundingClientRect();
    const next = placeTooltip({
      target: hit.rect,
      tooltip: { width: panelRect.width, height: panelRect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      insets,
      prefer: current.prefer,
    });

    setPlaced((prev) =>
      prev &&
      prev.step === stepIndex &&
      prev.placement.side === next.side &&
      Math.abs(prev.placement.x - next.x) < 0.5 &&
      Math.abs(prev.placement.y - next.y) < 0.5 &&
      Math.abs(prev.placement.arrow - next.arrow) < 0.5
        ? prev
        : { step: stepIndex, placement: next },
    );
  }, [stepIndex]);

  const scheduleMeasure = useCallback(() => {
    if (typeof requestAnimationFrame === "undefined") return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(measure);
  }, [measure]);

  // --- auto-start ----------------------------------------------------------

  useEffect(() => {
    if (state.status !== "armed") return;
    if (blocked) return;
    // The tour opens on the map, which is where onboarding lands members. If
    // they are somewhere else, wait rather than yanking them across the app.
    if (pathname !== TOUR_STEPS[0]?.route) return;
    if (document.visibilityState !== "visible") return;
    const timer = window.setTimeout(
      () => startTour("auto"),
      AUTOSTART_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.status, blocked, pathname]);

  // --- step machine --------------------------------------------------------

  useEffect(() => {
    if (!running) {
      expectedRef.current = null;
      lastPathRef.current = null;
      hasShownRef.current = false;
      missesRef.current = 0;
      retriedRef.current = -1;
      return;
    }

    // All the reasoning lives in lib/tour/machine.ts, where it can be tested.
    // Every branch below is just "do what it said".
    const action = reconcileTour({
      step: stepIndex,
      pathname,
      lastPathname: lastPathRef.current,
      expected: expectedRef.current,
      hasShown: hasShownRef.current,
    });
    lastPathRef.current = pathname;

    if (action.type === "finish") {
      endTour("finished");
      return;
    }
    if (action.type === "abandon") {
      // They left the tour's surfaces entirely. That is a skip, and a skip must
      // never nag again - the profile card is the way back in.
      endTour("abandoned");
      return;
    }
    if (action.type === "sync") {
      // The member tapped their way to another tour surface. Follow them rather
      // than dragging them back.
      goToStep(action.step);
      return;
    }
    if (action.type === "navigate") {
      expectedRef.current = action.route;
      router.push(action.route);
      return;
    }
    if (action.type === "wait") return;

    expectedRef.current = null;

    const current = TOUR_STEPS[stepIndex];
    if (!current) return; // unreachable: "show" implies a step in range

    const waiter = waitForTourTarget(current.target, {
      timeoutMs: TARGET_TIMEOUT_MS,
    });
    let live = true;
    void waiter.promise.then((hit) => {
      if (!live) return;
      if (!hit) {
        // One free retry per step: a surface caught mid-fade or mid-fetch on
        // the first look is usually there on the second.
        if (retriedRef.current !== stepIndex) {
          retriedRef.current = stepIndex;
          setRetryTick((tick) => tick + 1);
          return;
        }
        missesRef.current += 1;
        if (missesRef.current >= MISS_BUDGET) {
          // An undismissable broken tour that retries every session is worse
          // than one that quietly gives up.
          endTour("failed");
        } else {
          nextStep();
        }
        return;
      }
      missesRef.current = 0;
      retriedRef.current = -1;
      hasShownRef.current = true;
      setAnchor({ step: stepIndex, rect: hit.rect });
      scheduleMeasure();
    });

    return () => {
      live = false;
      waiter.cancel();
    };
  }, [running, stepIndex, pathname, retryTick, router, scheduleMeasure]);

  // A blocker (the map's welcome card, an open place sheet) PAUSES a running
  // tour rather than ending it: the surface in front gets the screen, and the
  // step comes back untouched when it releases. Only autostart is gated on
  // blocked as well, so nothing ever stacks two overlays.
  const showStep =
    running && !blocked && !!anchor && anchor.step === stepIndex;

  // --- re-measure triggers -------------------------------------------------

  useEffect(() => {
    if (!showStep) return;

    // The panel only mounts once showStep flips true, so the measure kicked off
    // alongside it may have run against a null ref. This effect runs after that
    // commit, which is the first moment the panel can actually be measured.
    scheduleMeasure();

    const onChange = () => scheduleMeasure();
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    window.addEventListener("scroll", onChange, {
      passive: true,
      capture: true,
    });
    window.visualViewport?.addEventListener("resize", onChange);
    window.visualViewport?.addEventListener("scroll", onChange);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(onChange);
      if (panelRef.current) observer.observe(panelRef.current);
      const current = TOUR_STEPS[stepIndex];
      // Re-resolved per step: crossing a route group destroys the old nav
      // element entirely, so a cached ref would observe a detached node.
      const hit = current ? resolveTourTarget(current.target) : null;
      if (hit) observer.observe(hit.el);
    }

    // Fraunces and Geist load with display:swap, so the panel reflows after
    // the swap lands and the placement has to catch up.
    void document.fonts?.ready.then(() => scheduleMeasure());

    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      window.removeEventListener("scroll", onChange, { capture: true });
      window.visualViewport?.removeEventListener("resize", onChange);
      window.visualViewport?.removeEventListener("scroll", onChange);
      observer?.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [showStep, stepIndex, scheduleMeasure]);

  // --- click-through -------------------------------------------------------

  useEffect(() => {
    if (!running || blocked) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchored = target.closest("[data-tour]");
      const name = anchored?.getAttribute("data-tour");
      if (!name) return;
      const index = STEP_BY_ANCHOR.get(name);
      if (index === undefined) return;
      // Tapping the spotlit item is a confirm; tapping another surface's item
      // moves the tour there. Either way the <Link> navigates and the step
      // machine above reconciles.
      if (index === stepIndex) nextStep();
      else goToStep(index);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [running, blocked, stepIndex]);

  // --- escape --------------------------------------------------------------

  // Escape lives on the document, not on the layer's onKeyDown, because focus
  // is not guaranteed to be inside the overlay: the tour is deliberately
  // non-modal, so tapping the spotlit nav item moves focus to that <Link>, and
  // a step in flight has no panel mounted at all. A dismissal that only works
  // from one focus position is not "keyboard-dismissible".
  //
  // The directional keys stay on the panel on purpose - hijacking arrows
  // document-wide would fight Leaflet's keyboard panning and any focused input.
  useEffect(() => {
    if (!running || blocked) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // A truly modal dialog on top owns Escape: closing the thing in front of
      // you is what the key means there, and the sheet's own handler is the
      // only one that can do it. The tour's own panel is role="dialog" WITHOUT
      // aria-modal precisely because it isn't modal, so it never matches here.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.stopPropagation();
      endTour("skipped");
    };
    document.addEventListener("keydown", onEscape, true);
    return () => document.removeEventListener("keydown", onEscape, true);
  }, [running, blocked]);

  // --- focus ---------------------------------------------------------------

  useEffect(() => {
    if (!running) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    return () => {
      const opener = openerRef.current;
      // The step's navigation almost certainly unmounted the opener, so unlike
      // the sheet's version this needs a liveness check before restoring.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [running]);

  useEffect(() => {
    if (!showStep) return;
    // Focus the panel itself, not the Next button, so a screen reader reads the
    // dialog's name and description before its controls.
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showStep, stepIndex]);

  // --- keyboard ------------------------------------------------------------

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape is handled document-wide above, so it works from any focus
    // position rather than only from inside this subtree.
    if (event.key === "Tab") {
      if (panelRef.current) trapTab(panelRef.current, event);
      return;
    }
    if (
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === "PageDown"
    ) {
      event.preventDefault();
      nextStep();
      return;
    }
    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowUp" ||
      event.key === "PageUp"
    ) {
      event.preventDefault();
      prevStep();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Only when the panel itself has focus - otherwise Enter on the Back
      // button would advance instead of going back.
      if (event.target !== panelRef.current) return;
      event.preventDefault();
      nextStep();
    }
  }

  // --- render --------------------------------------------------------------

  const visible = running && !blocked && TOUR_ROUTES.has(pathname) && !!step;
  const placement =
    placed && placed.step === stepIndex ? placed.placement : null;
  // Kept across step changes so the spotlight travels to the next target
  // instead of blinking out and back in.
  const framed = anchor
    ? {
        x: anchor.rect.x - PAD,
        y: anchor.rect.y - PAD,
        width: anchor.rect.width + PAD * 2,
        height: anchor.rect.height + PAD * 2,
      }
    : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="tour"
          onKeyDown={onKeyDown}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: easeOutExpo }}
          // pointer-events-none is load-bearing, not tidiness: a full-viewport
          // fixed layer with default pointer events swallows every click,
          // including the one over the spotlight's "hole". The blocker rects
          // and the panel opt back in individually.
          className="pointer-events-none fixed inset-0 z-[1200] overflow-hidden"
        >
          {/* Inset probes: 1px spans that actually lay out, so the env()/calc()
              layout tokens can be read as real pixels. */}
          <span
            ref={topInsetRef}
            aria-hidden
            className="absolute left-0 top-0 h-[var(--safe-top)] w-px"
          />
          <span
            ref={bottomInsetRef}
            aria-hidden
            className="absolute bottom-0 left-0 h-[var(--tab-clearance)] w-px"
          />

          {/* Hit-testing: four transparent rects framing the target, leaving a
              real pointer hole so the spotlit nav item stays tappable. The
              seams between them are invisible and a stray 1px click through
              one costs nothing.

              onMouseDown preventDefault keeps focus in the panel when the dim
              is clicked. Without it the browser blurs to <body>, and every
              key handler below - Escape included - stops receiving anything. */}
          {showStep && framed && (
            <>
              <div
                aria-hidden
                onMouseDown={swallowFocus}
                className="pointer-events-auto absolute inset-x-0 top-0 touch-none"
                style={{ height: Math.max(0, framed.y) }}
              />
              <div
                aria-hidden
                onMouseDown={swallowFocus}
                className="pointer-events-auto absolute inset-x-0 bottom-0 touch-none"
                style={{ top: framed.y + framed.height }}
              />
              <div
                aria-hidden
                onMouseDown={swallowFocus}
                className="pointer-events-auto absolute left-0 touch-none"
                style={{
                  top: framed.y,
                  height: framed.height,
                  width: Math.max(0, framed.x),
                }}
              />
              <div
                aria-hidden
                onMouseDown={swallowFocus}
                className="pointer-events-auto absolute right-0 touch-none"
                style={{
                  top: framed.y,
                  height: framed.height,
                  left: framed.x + framed.width,
                }}
              />
            </>
          )}

          {/* Visuals: dims everything outside its own box. Paint only, so it
              never covers the pointer hole. */}
          {framed && (
            <motion.div
              aria-hidden
              className="om-tour-spotlight pointer-events-none absolute left-0 top-0 rounded-2xl"
              initial={false}
              animate={{
                x: framed.x,
                y: framed.y,
                width: framed.width,
                height: framed.height,
                opacity: showStep ? 1 : 0,
              }}
              transition={{ duration: reduced ? 0 : 0.32, ease: easeOutExpo }}
            />
          )}

          {/* Announced only once the step is actually on screen: while a step
              is still resolving its target there is nothing to look at, and
              announcing "Step 3 of 6" over an unchanged screen is a lie. */}
          {showStep && (
            <p role="status" aria-live="polite" aria-atomic className="sr-only">
              {`Step ${stepIndex + 1} of ${TOUR_STEP_COUNT}`}
            </p>
          )}

          {step && showStep && (
            <CoachMark
              step={step}
              index={stepIndex}
              total={TOUR_STEP_COUNT}
              placement={placement}
              reduced={reduced}
              panelRef={panelRef}
              titleId={titleId}
              bodyId={bodyId}
              onNext={nextStep}
              onBack={prevStep}
              onSkip={() => endTour("skipped")}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
