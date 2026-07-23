import { describe, expect, it } from "vitest";
import { ratePct, funnelShares } from "@/lib/metrics/format";

describe("ratePct", () => {
  it("rounds a percentage", () => {
    expect(ratePct(1, 4)).toBe(25);
    expect(ratePct(2, 3)).toBe(67);
  });

  it("returns 0 for a zero or negative denominator (never NaN)", () => {
    expect(ratePct(5, 0)).toBe(0);
    expect(ratePct(0, 0)).toBe(0);
  });
});

describe("funnelShares", () => {
  it("expresses each stage as a share of the top", () => {
    const shares = funnelShares([
      { stage: "signed_up", n: 100, ord: 1 },
      { stage: "onboarded", n: 80, ord: 2 },
      { stage: "first_ask", n: 40, ord: 3 },
    ]);
    expect(shares).toEqual([
      { stage: "signed_up", n: 100, pct: 100 },
      { stage: "onboarded", n: 80, pct: 80 },
      { stage: "first_ask", n: 40, pct: 40 },
    ]);
  });

  it("handles an empty funnel without dividing by zero", () => {
    expect(funnelShares([])).toEqual([]);
  });
});
