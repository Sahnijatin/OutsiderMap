import { describe, expect, it } from "vitest";
import { ratePct, funnelShares, reasonSourceTile } from "@/lib/metrics/format";

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

describe("reasonSourceTile", () => {
  /**
   * Three states, not two. The tile reports how often members got a reason
   * written for them rather than the editor note every other member sees, so
   * showing 0% when there is simply no number would be the loudest possible
   * false alarm on this particular dashboard.
   */
  it("shows the rate when there are picks to measure", () => {
    expect(reasonSourceTile({ model: 9, editorNote: 1, degraded: 0 })).toEqual({
      value: "90%",
      sub: "9/10 picks",
      muted: false,
    });
  });

  it("notes degraded picks separately", () => {
    // Degraded turns fall back to keyword search, whose picks carry editor
    // notes by construction - folding them in would let a provider outage read
    // as a personalization regression.
    expect(reasonSourceTile({ model: 9, editorNote: 1, degraded: 2 }).sub).toBe(
      "9/10 picks \u00b7 2 degraded",
    );
  });

  it("distinguishes an undeployed metric from a quiet week", () => {
    // The regression this pins: `metrics_reason_source` is new, so on a deploy
    // where code lands before migrations the RPC is genuinely missing. Reading
    // that as "0% of reasons were written for the member" would send someone
    // hunting a personalization collapse that never happened.
    expect(reasonSourceTile(null).sub).toBe("metric not deployed yet");
    expect(reasonSourceTile({ model: 0, editorNote: 0, degraded: 0 }).sub).toBe(
      "awaiting picks",
    );
  });

  it("shows no number at all in either empty state", () => {
    for (const empty of [null, { model: 0, editorNote: 0, degraded: 0 }]) {
      expect(reasonSourceTile(empty)).toMatchObject({ value: "-", muted: true });
    }
  });

  it("still reports a rate of zero when zero is the real answer", () => {
    // Every pick carrying the shared editor note is a genuine 0%, and the tile
    // must say so rather than hiding behind the same dash as "no data".
    expect(reasonSourceTile({ model: 0, editorNote: 12, degraded: 0 })).toEqual({
      value: "0%",
      sub: "0/12 picks",
      muted: false,
    });
  });
});
