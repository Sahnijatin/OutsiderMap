"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type TouchEvent,
} from "react";
import { useReducedMotion } from "motion/react";
import { isNativeApp } from "@/lib/capacitor/platform";
import { tap } from "@/lib/native/haptics";
import { playSound } from "@/lib/sound/engine";
import { Spinner } from "@/components/ui/spinner";

/**
 * Touch-driven pull-to-refresh for scrollable list surfaces. Dragging down
 * from the top reveals a branded indicator; past the threshold it fires
 * `router.refresh()` (server components re-fetch) plus an optional
 * `onRefresh` callback, with a haptic tick on trigger.
 *
 * Only activates on touch devices running as an installed app (standalone
 * PWA or the Capacitor shell) - a plain browser tab already has native
 * pull-to-refresh and we must not fight it. The indicator overlays the
 * content (opacity/transform only, no layout shift, no transformed
 * ancestors to break `position: fixed` children). Reduced motion swaps the
 * slide-and-scale for a plain fade. Dependency-free.
 */

const THRESHOLD = 70;
const MAX_PULL = 110;

export function PullToRefresh({
  children,
  onRefresh,
  className,
}: {
  children: ReactNode;
  /** Extra client-side work on trigger (e.g. re-running a client fetch). */
  onRefresh?: () => void | Promise<void>;
  className?: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const startY = useRef<number | null>(null);

  const refreshing = pending || localBusy;

  useEffect(() => {
    let cancelled = false;
    const touch =
      "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
    if (!touch) return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ?? false;
    // Async either way, so state settles off the render pass.
    void isNativeApp().then((native) => {
      if (!cancelled && (standalone || native)) setEnabled(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Retract the indicator once the refresh settles (next frame, so the
  // transition has something to animate from).
  useEffect(() => {
    if (refreshing) return;
    const raf = requestAnimationFrame(() =>
      setPull((p) => (p >= THRESHOLD ? 0 : p)),
    );
    return () => cancelAnimationFrame(raf);
  }, [refreshing]);

  function atTop(): boolean {
    return (document.scrollingElement?.scrollTop ?? 0) <= 0;
  }

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    if (!enabled || refreshing) return;
    if (!atTop()) return;
    startY.current = e.touches[0].clientY;
    setDragging(true);
  }

  function stopDragging() {
    startY.current = null;
    setDragging(false);
  }

  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0 || !atTop()) {
      setPull(0);
      if (dy <= -8) stopDragging(); // Scrolling away - stand down.
      return;
    }
    setPull(Math.min(MAX_PULL, dy * 0.45)); // Elastic resistance.
  }

  function onTouchEnd() {
    if (startY.current == null) return;
    const armed = pull >= THRESHOLD;
    stopDragging();
    if (!armed) {
      setPull(0);
      return;
    }
    setPull(THRESHOLD); // Hold the indicator while the city answers.
    tap();
    playSound("tap");
    startTransition(() => router.refresh());
    if (onRefresh) {
      setLocalBusy(true);
      void Promise.resolve()
        .then(() => onRefresh())
        .catch(() => {})
        .finally(() => setLocalBusy(false));
    }
  }

  function onTouchCancel() {
    stopDragging();
    if (!refreshing) setPull(0);
  }

  const progress = Math.min(1, pull / THRESHOLD);
  const showing = refreshing || pull > 6;

  return (
    <div
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {enabled && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
          style={{ top: "calc(var(--safe-top) + 0.75rem)" }}
        >
          <div
            className="flex items-center gap-2 rounded-full border border-line bg-surface/95 px-4 py-2 shadow-lg backdrop-blur"
            style={{
              opacity: showing ? (refreshing ? 1 : progress) : 0,
              transform: reduced
                ? undefined
                : `translate3d(0, ${showing ? 0 : -12}px, 0) scale(${
                    0.9 + 0.1 * (refreshing ? 1 : progress)
                  })`,
              transition: dragging
                ? undefined
                : "opacity 220ms ease, transform 220ms ease",
            }}
          >
            <Spinner className="size-3.5" />
            <span className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-ink-dim">
              {refreshing ? "checking the city…" : "pull to refresh"}
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
