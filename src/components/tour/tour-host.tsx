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

const ROUTE_TO_INDEX: ReadonlyMap<string, number> = new Map(
  TOUR_STEPS.map((step, index) => [step.route, index]),
);

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
  /** Whether any step has actually been shown yet. Distinguishes "the tour
   *  just launched somewhere else, get me to step 0" from "the member wandered
   *  off mid-tour" - the two look identical from pathname alone. */
  const hasShownRef = useRef(false);
  const missesRef = useRef(0);
  const rafRef = useRef(0);

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
      hasShownRef.current = false;
      missesRef.current = 0;
      return;
    }

    const current = TOUR_STEPS[stepIndex];
    // TOUR_STEPS[i] types as TourStep even out of range: tsconfig has no
    // noUncheckedIndexedAccess, so this guard is hand-written on purpose.
    if (!current) {
      endTour("finished");
      return;
    }

    if (pathname !== current.route) {
      // Our own push, still in flight.
      if (expectedRef.current === current.route) return;

      const followed = ROUTE_TO_INDEX.get(pathname);
      if (hasShownRef.current) {
        if (followed !== undefined) {
          // The member tapped their way to another tour surface. Follow them
          // rather than dragging them back.
          goToStep(followed);
        } else {
          // They left the tour's surfaces entirely. That is a skip, and a skip
          // must never nag again - the profile card is the way back in.
          endTour("abandoned");
        }
        return;
      }

      // Nothing shown yet: this is a launch from elsewhere (the replay button
      // on /profile), so drive to the first step instead of re-syncing to
      // wherever they happen to be standing.
      expectedRef.current = current.route;
      router.push(current.route);
      return;
    }

    expectedRef.current = null;

    const waiter = waitForTourTarget(current.target, {
      timeoutMs: TARGET_TIMEOUT_MS,
    });
    let live = true;
    void waiter.promise.then((hit) => {
      if (!live) return;
      if (!hit) {
        missesRef.current += 1;
        if (missesRef.current >= 2) {
          // An undismissable broken tour that retries every session is worse
          // than one that quietly gives up.
          endTour("failed");
        } else {
          nextStep();
        }
        return;
      }
      missesRef.current = 0;
      hasShownRef.current = true;
      setAnchor({ step: stepIndex, rect: hit.rect });
      scheduleMeasure();
    });

    return () => {
      live = false;
      waiter.cancel();
    };
  }, [running, stepIndex, pathname, router, scheduleMeasure]);

  const showStep = running && !!anchor && anchor.step === stepIndex;

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
    if (!running) return;
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
  }, [running, stepIndex]);

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
    if (event.key === "Escape") {
      event.stopPropagation();
      endTour("skipped");
      return;
    }
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

  const visible = running && TOUR_ROUTES.has(pathname) && !!step;
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
          className="fixed inset-0 z-[1200] overflow-hidden"
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
              one costs nothing. */}
          {showStep && framed && (
            <>
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 touch-none"
                style={{ height: Math.max(0, framed.y) }}
              />
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 touch-none"
                style={{ top: framed.y + framed.height }}
              />
              <div
                aria-hidden
                className="absolute left-0 touch-none"
                style={{
                  top: framed.y,
                  height: framed.height,
                  width: Math.max(0, framed.x),
                }}
              />
              <div
                aria-hidden
                className="absolute right-0 touch-none"
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

          <p role="status" aria-live="polite" className="sr-only">
            {`Step ${stepIndex + 1} of ${TOUR_STEP_COUNT}`}
          </p>

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
