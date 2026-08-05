/**
 * Pure placement math for the guided tour's coach mark. Zero DOM, zero React -
 * every hard case here (the 390px clamp, the two-navs-one-visible pick, the
 * caret staying on target after a clamp) is a plain function so the repo's
 * node-env vitest can actually cover it.
 */

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Side = "top" | "bottom" | "left" | "right";
export type Placement = {
  side: Side;
  x: number;
  y: number;
  /** Caret offset along the panel's edge, in px from its left/top. */
  arrow: number;
  /** False when nothing fit and we fell back to the roomiest side. */
  fits: boolean;
};

const OPPOSITE: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};
const FALLBACK_ORDER: readonly Side[] = ["top", "bottom", "right", "left"];
const ARROW_INSET = 16;

/**
 * Clamp that pins to `lo` when the range is inverted - i.e. when the panel is
 * wider than the space it has to live in, which is the 390px phone case. The
 * naive Math.min(Math.max(...)) returns a NEGATIVE x there, the panel hangs off
 * the left edge, and mobile-verify's no-horizontal-scroll assertion fails. This
 * one behaviour is load-bearing; don't "simplify" it.
 */
export function clamp(value: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.min(Math.max(value, lo), hi);
}

/** Sub-pixel-tolerant rect compare, so a ResizeObserver can't feed a render loop. */
export function rectsEqual(a: Rect, b: Rect, epsilon = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.width - b.width) < epsilon &&
    Math.abs(a.height - b.height) < epsilon
  );
}

/**
 * Where to put the panel relative to the spotlit target.
 *
 * The automatic side preference is derived from where the target actually sits
 * rather than hard-coded per step, because the same logical target is a bottom
 * tab on a phone and a left-rail row on a laptop.
 */
export function placeTooltip({
  target,
  tooltip,
  viewport,
  insets,
  gap = 12,
  margin = 12,
  prefer,
}: {
  target: Rect;
  tooltip: Size;
  viewport: Size;
  insets: Insets;
  /** Space between the target's edge and the panel. */
  gap?: number;
  /** Minimum breathing room against the usable viewport edge. */
  margin?: number;
  prefer?: Side;
}): Placement {
  const bounds = {
    left: insets.left + margin,
    top: insets.top + margin,
    right: viewport.width - insets.right - margin,
    bottom: viewport.height - insets.bottom - margin,
  };
  const targetRight = target.x + target.width;
  const targetBottom = target.y + target.height;
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;

  // Free space on each side's main axis, once the gap is paid for.
  const room: Record<Side, number> = {
    top: target.y - gap - bounds.top,
    bottom: bounds.bottom - (targetBottom + gap),
    left: target.x - gap - bounds.left,
    right: bounds.right - (targetRight + gap),
  };
  const need: Record<Side, number> = {
    top: tooltip.height,
    bottom: tooltip.height,
    left: tooltip.width,
    right: tooltip.width,
  };

  const auto: Side =
    centerX < viewport.width * 0.25
      ? "right" // hugging the left edge: the side rail
      : centerY > viewport.height / 2
        ? "top" // lower half: the bottom tabs
        : "bottom";

  const order: Side[] = [];
  for (const side of [
    prefer,
    auto,
    prefer ? OPPOSITE[prefer] : undefined,
    ...FALLBACK_ORDER,
  ]) {
    if (side && !order.includes(side)) order.push(side);
  }

  const firstFit = order.find((side) => room[side] >= need[side]);
  // Nothing fits (a very short viewport): take the side with the most surplus
  // and let the clamp below keep it on screen.
  const side =
    firstFit ??
    order.reduce((best, candidate) =>
      room[candidate] - need[candidate] > room[best] - need[best]
        ? candidate
        : best,
    );

  let x: number;
  let y: number;
  if (side === "top" || side === "bottom") {
    x = centerX - tooltip.width / 2;
    y = side === "top" ? target.y - gap - tooltip.height : targetBottom + gap;
  } else {
    x = side === "left" ? target.x - gap - tooltip.width : targetRight + gap;
    y = centerY - tooltip.height / 2;
  }

  x = clamp(x, bounds.left, bounds.right - tooltip.width);
  y = clamp(y, bounds.top, bounds.bottom - tooltip.height);

  // Keep the caret over the target even after the clamp slid the panel along.
  const arrow =
    side === "top" || side === "bottom"
      ? clamp(
          centerX - x,
          ARROW_INSET,
          Math.max(ARROW_INSET, tooltip.width - ARROW_INSET),
        )
      : clamp(
          centerY - y,
          ARROW_INSET,
          Math.max(ARROW_INSET, tooltip.height - ARROW_INSET),
        );

  return { side, x, y, arrow, fits: firstFit !== undefined };
}

/**
 * Both navs are permanently in the DOM with one display:none'd, so a
 * `data-tour` query always returns two elements and the invisible one measures
 * 0x0. Pick the largest genuinely-painted candidate - largest-area rather than
 * first-non-zero, so a frame caught mid-breakpoint-flip (where both could
 * briefly measure) still resolves deterministically.
 */
export function pickVisibleCandidate<T extends { rect: Rect; visible: boolean }>(
  candidates: readonly T[],
): T | null {
  let best: T | null = null;
  let bestArea = 0;
  for (const candidate of candidates) {
    if (!candidate.visible) continue;
    const area = candidate.rect.width * candidate.rect.height;
    if (area <= 0) continue;
    if (area > bestArea) {
      best = candidate;
      bestArea = area;
    }
  }
  return best;
}
