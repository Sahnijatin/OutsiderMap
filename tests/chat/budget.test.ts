import { describe, expect, it } from "vitest";
import { effectiveTier, rupeesToTier } from "@/lib/chat/budget";

describe("rupeesToTier", () => {
  it("maps per-head rupee budgets to the fitting tier ceiling", () => {
    expect(rupeesToTier(200)).toBe(1); // "200 mein dinner"
    expect(rupeesToTier(300)).toBe(1);
    expect(rupeesToTier(500)).toBe(2);
    expect(rupeesToTier(700)).toBe(2);
    expect(rupeesToTier(1200)).toBe(3);
    expect(rupeesToTier(1500)).toBe(3);
    expect(rupeesToTier(3000)).toBe(4);
  });

  it("returns null for non-positive / non-finite input", () => {
    expect(rupeesToTier(0)).toBeNull();
    expect(rupeesToTier(-50)).toBeNull();
    expect(rupeesToTier(Number.NaN)).toBeNull();
  });
});

describe("effectiveTier", () => {
  it("takes the stricter of tier and rupee budget", () => {
    expect(effectiveTier(4, 200)).toBe(1); // fancy wish, ₹200 wallet -> 1
    expect(effectiveTier(2, 3000)).toBe(2); // tier 2 stated, big budget -> 2
  });

  it("falls back to whichever is present", () => {
    expect(effectiveTier(3, null)).toBe(3);
    expect(effectiveTier(null, 500)).toBe(2);
    expect(effectiveTier(null, null)).toBeNull();
    expect(effectiveTier(undefined, undefined)).toBeNull();
  });
});
