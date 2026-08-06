"use client";

import { pickVisibleCandidate, rectsEqual, type Rect } from "@/lib/tour/geometry";

export type TourTarget = { el: HTMLElement; rect: Rect };

type VisibilityCapableElement = Element & {
  checkVisibility?: (options?: {
    contentVisibilityAuto?: boolean;
    opacityProperty?: boolean;
    visibilityProperty?: boolean;
  }) => boolean;
};

function toRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  // Viewport-relative, deliberately. The navs are position:fixed and the tour
  // overlay is position:fixed in an untransformed body, so the two already
  // share a coordinate space. Adding scrollX/scrollY here is the classic
  // coach-mark bug: it only shows up once someone scrolls a shell page, and
  // then the spotlight sits nowhere near the thing it is pointing at.
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function isVisible(el: Element): boolean {
  const candidate = el as VisibilityCapableElement;
  if (typeof candidate.checkVisibility === "function") {
    return candidate.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true,
    });
  }
  // Older WebViews: the zero-area test in pickVisibleCandidate carries it.
  return true;
}

/**
 * THE resolver. Both navs are permanently in the DOM with one display:none'd,
 * so a bare querySelector returns whichever comes first in source order - the
 * bottom tabs, which on a laptop measure 0x0 and collapse the spotlight to a
 * dot at the origin. Every data-tour lookup goes through here.
 */
export function resolveTourTarget(
  anchor: string,
  root: ParentNode = document,
): TourTarget | null {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`),
  );
  const picked = pickVisibleCandidate(
    nodes.map((el) => ({ el, visible: isVisible(el), rect: toRect(el) })),
  );
  return picked ? { el: picked.el, rect: picked.rect } : null;
}

/**
 * Wait for a target to exist AND settle.
 *
 * rAF-polled rather than MutationObserver-driven, because there are two
 * different waits here: after a cross-group navigation the nav element is
 * brand new, and after a same-group one it already exists but its rect is
 * still stale behind (shell)/template.tsx's 150ms fade. Two identical
 * consecutive frames is the cheapest honest "it has painted where it intends
 * to stay".
 *
 * cancel() is not optional - StrictMode double-invokes the effect that starts
 * this, and a leaked rAF loop would keep measuring a dead step.
 */
export function waitForTourTarget(
  anchor: string,
  {
    timeoutMs = 4000,
    stableFrames = 2,
  }: { timeoutMs?: number; stableFrames?: number } = {},
): { promise: Promise<TourTarget | null>; cancel: () => void } {
  let frame = 0;
  let cancelled = false;
  let settle: ((value: TourTarget | null) => void) | null = null;

  const promise = new Promise<TourTarget | null>((resolve) => {
    settle = resolve;
    if (typeof requestAnimationFrame === "undefined") {
      resolve(resolveTourTarget(anchor));
      return;
    }

    const startedAt = Date.now();
    let last: Rect | null = null;
    let stable = 0;

    const tick = () => {
      if (cancelled) return;
      const hit = resolveTourTarget(anchor);
      if (hit) {
        if (last && rectsEqual(last, hit.rect)) {
          stable += 1;
          if (stable >= stableFrames) {
            resolve(hit);
            return;
          }
        } else {
          stable = 0;
        }
        last = hit.rect;
      } else {
        last = null;
        stable = 0;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(null);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (frame && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(frame);
      }
      settle?.(null);
    },
  };
}
