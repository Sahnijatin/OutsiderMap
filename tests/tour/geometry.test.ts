import { describe, expect, it } from "vitest";
import {
  clamp,
  pickVisibleCandidate,
  placeTooltip,
  rectsEqual,
  type Insets,
  type Rect,
} from "@/lib/tour/geometry";

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
/** iPhone 14 with the bottom tab bar and the home indicator. */
const PHONE_INSETS: Insets = { top: 47, right: 0, bottom: 98, left: 0 };
const PHONE = { width: 390, height: 780 };
const LAPTOP = { width: 1280, height: 800 };
const PANEL = { width: 320, height: 140 };

describe("clamp", () => {
  it("clamps into range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it("pins to lo when the range is inverted", () => {
    // The panel is wider than the space it has. Naive clamping returns a
    // negative x here and the page scrolls sideways.
    expect(clamp(-40, 12, -22)).toBe(12);
  });

  it("handles an empty range", () => {
    expect(clamp(99, 7, 7)).toBe(7);
  });
});

describe("rectsEqual", () => {
  const base: Rect = { x: 10, y: 10, width: 100, height: 40 };
  it("treats sub-pixel drift as equal", () => {
    expect(rectsEqual(base, { ...base, x: 10.4 })).toBe(true);
  });
  it("treats a real move as different", () => {
    expect(rectsEqual(base, { ...base, x: 10.6 })).toBe(false);
  });
});

describe("placeTooltip", () => {
  it("puts the panel above a bottom tab, clear of the tab bar", () => {
    const target: Rect = { x: 32, y: 690, width: 60, height: 56 };
    const p = placeTooltip({
      target,
      tooltip: PANEL,
      viewport: PHONE,
      insets: PHONE_INSETS,
    });

    expect(p.side).toBe("top");
    expect(p.fits).toBe(true);
    // Never overlaps the tab bar it is pointing at.
    expect(p.y + PANEL.height).toBeLessThanOrEqual(
      PHONE.height - PHONE_INSETS.bottom - 12,
    );
    expect(p.y).toBeGreaterThanOrEqual(PHONE_INSETS.top + 12);
  });

  it("puts the panel right of a side-rail row", () => {
    const target: Rect = { x: 12, y: 200, width: 192, height: 44 };
    const p = placeTooltip({
      target,
      tooltip: PANEL,
      viewport: LAPTOP,
      insets: NO_INSETS,
    });

    expect(p.side).toBe("right");
    expect(p.x).toBeGreaterThanOrEqual(target.x + target.width + 12);
  });

  it("honours prefer when it fits", () => {
    const target: Rect = { x: 600, y: 400, width: 80, height: 40 };
    const p = placeTooltip({
      target,
      tooltip: PANEL,
      viewport: LAPTOP,
      insets: NO_INSETS,
      prefer: "left",
    });
    expect(p.side).toBe("left");
  });

  it("flips away from prefer when there is no room", () => {
    // Hard against the left edge: "left" cannot fit a 320px panel.
    const target: Rect = { x: 4, y: 400, width: 80, height: 40 };
    const p = placeTooltip({
      target,
      tooltip: PANEL,
      viewport: LAPTOP,
      insets: NO_INSETS,
      prefer: "left",
    });
    expect(p.side).not.toBe("left");
    expect(p.x).toBeGreaterThanOrEqual(12);
  });

  it("keeps a wide panel inside a 390px viewport", () => {
    const target: Rect = { x: 32, y: 690, width: 60, height: 56 };
    const wide = { width: 366, height: 140 };
    const p = placeTooltip({
      target,
      tooltip: wide,
      viewport: PHONE,
      insets: PHONE_INSETS,
    });

    expect(p.x).toBe(12);
    expect(p.x + wide.width).toBeLessThanOrEqual(PHONE.width - 12);
  });

  it("never returns a negative x when the panel is wider than the viewport", () => {
    // The no-horizontal-scroll guarantee. mobile-verify asserts the document
    // overflows by <= 2px; a negative x here would blow that.
    const target: Rect = { x: 32, y: 690, width: 60, height: 56 };
    const tooWide = { width: 480, height: 140 };
    const p = placeTooltip({
      target,
      tooltip: tooWide,
      viewport: PHONE,
      insets: PHONE_INSETS,
    });

    expect(p.x).toBe(12);
    expect(p.x).toBeGreaterThanOrEqual(0);
  });

  it("reports fits: false when nothing has room", () => {
    const target: Rect = { x: 0, y: 0, width: 390, height: 300 };
    const p = placeTooltip({
      target,
      tooltip: { width: 380, height: 400 },
      viewport: { width: 390, height: 320 },
      insets: NO_INSETS,
    });
    expect(p.fits).toBe(false);
  });

  it("points the caret at the target centre when unclamped", () => {
    const target: Rect = { x: 600, y: 400, width: 80, height: 40 };
    const p = placeTooltip({
      target,
      tooltip: PANEL,
      viewport: LAPTOP,
      insets: NO_INSETS,
      prefer: "top",
    });
    // Panel is centred on the target, so the caret sits at its midpoint.
    expect(p.arrow).toBeCloseTo(PANEL.width / 2, 5);
  });

  it("keeps the caret inside the panel after a clamp", () => {
    const target: Rect = { x: 4, y: 690, width: 40, height: 56 };
    const p = placeTooltip({
      target,
      tooltip: PANEL,
      viewport: PHONE,
      insets: PHONE_INSETS,
    });
    expect(p.arrow).toBeGreaterThanOrEqual(16);
    expect(p.arrow).toBeLessThanOrEqual(PANEL.width - 16);
  });
});

describe("pickVisibleCandidate", () => {
  const painted = { rect: { x: 0, y: 0, width: 60, height: 56 }, visible: true };
  const hidden = { rect: { x: 0, y: 0, width: 0, height: 0 }, visible: true };

  it("picks the painted nav when the other is display:none", () => {
    expect(pickVisibleCandidate([hidden, painted])).toBe(painted);
  });

  it("picks the painted nav regardless of source order", () => {
    expect(pickVisibleCandidate([painted, hidden])).toBe(painted);
  });

  it("returns null when nothing is painted", () => {
    expect(pickVisibleCandidate([hidden, hidden])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(pickVisibleCandidate([])).toBeNull();
  });

  it("prefers the larger candidate mid-breakpoint-flip", () => {
    const small = {
      rect: { x: 0, y: 0, width: 10, height: 10 },
      visible: true,
    };
    expect(pickVisibleCandidate([small, painted])).toBe(painted);
  });

  it("skips candidates marked invisible even with a non-zero rect", () => {
    const invisible = { ...painted, visible: false };
    expect(pickVisibleCandidate([invisible])).toBeNull();
  });
});
