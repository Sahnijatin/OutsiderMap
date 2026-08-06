import { describe, expect, it } from "vitest";
import { FOCUSABLE, nextTrapIndex } from "@/lib/a11y/focus-trap";

describe("nextTrapIndex", () => {
  it("does nothing when there is nothing to focus", () => {
    expect(nextTrapIndex(0, -1, false)).toBeNull();
    expect(nextTrapIndex(0, -1, true)).toBeNull();
  });

  it("wraps forward from the last item to the first", () => {
    expect(nextTrapIndex(3, 2, false)).toBe(0);
  });

  it("lets the browser handle a forward Tab in the middle", () => {
    expect(nextTrapIndex(3, 0, false)).toBeNull();
    expect(nextTrapIndex(3, 1, false)).toBeNull();
  });

  it("wraps backward from the first item to the last", () => {
    expect(nextTrapIndex(3, 0, true)).toBe(2);
  });

  it("wraps backward from the panel itself to the last item", () => {
    // activeIndex === -1: focus is on the panel, which is where each step starts.
    expect(nextTrapIndex(3, -1, true)).toBe(2);
  });

  it("lets the browser handle a backward Tab in the middle", () => {
    expect(nextTrapIndex(3, 2, true)).toBeNull();
  });

  it("handles a single focusable in both directions", () => {
    expect(nextTrapIndex(1, 0, false)).toBe(0);
    expect(nextTrapIndex(1, 0, true)).toBe(0);
  });
});

describe("FOCUSABLE", () => {
  it("excludes explicitly untabbable nodes", () => {
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])');
  });

  it("excludes disabled controls", () => {
    expect(FOCUSABLE).toContain("button:not([disabled])");
  });
});
