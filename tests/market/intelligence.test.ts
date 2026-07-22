import { describe, expect, it } from "vitest";
import { aggregate } from "@/lib/market/intelligence";
import type { PricePoint, PriceSource } from "@/lib/market/types";

// A fixed "now" keeps decay/freshness deterministic.
const NOW = new Date("2026-07-22T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function pp(over: Partial<PricePoint> = {}): PricePoint {
  return {
    price: 400,
    source: "user_report" as PriceSource,
    confidence: 0.8,
    observedAt: daysAgo(10),
    ...over,
  };
}

describe("aggregate - honesty invariants", () => {
  it("returns insufficient for no data", () => {
    const r = aggregate([], NOW);
    expect(r.basis).toBe("insufficient");
    expect(r.band).toBeNull();
    expect(r.confidence).toBe(0);
  });

  it("never fabricates a number from a single source", () => {
    const r = aggregate([pp({ price: 300 })], NOW);
    expect(r.basis).toBe("insufficient");
    expect(r.band).toBeNull();
  });

  it("never surfaces a lone stale video as fact", () => {
    const r = aggregate(
      [pp({ price: 300, source: "content_mined", observedAt: daysAgo(400) })],
      NOW,
    );
    expect(r.basis).toBe("insufficient");
    expect(r.band).toBeNull();
    expect(r.freshSampleSize).toBe(0);
  });

  it("an undated authored point alone is not enough for a band", () => {
    const r = aggregate([pp({ source: "authored", observedAt: null })], NOW);
    expect(r.basis).toBe("insufficient");
  });
});

describe("aggregate - bands", () => {
  it("builds an honest band from several fresh reports", () => {
    const r = aggregate(
      [
        pp({ price: 300, observedAt: daysAgo(5) }),
        pp({ price: 380, observedAt: daysAgo(12) }),
        pp({ price: 420, observedAt: daysAgo(20) }),
        pp({ price: 450, observedAt: daysAgo(8) }),
      ],
      NOW,
    );
    expect(r.basis).toBe("band");
    expect(r.band).not.toBeNull();
    expect(r.band!.low).toBeLessThanOrEqual(r.band!.high);
    expect(r.band!.low).toBeGreaterThanOrEqual(300);
    expect(r.band!.high).toBeLessThanOrEqual(450);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.freshSampleSize).toBe(4);
  });

  it("trims outliers so one wild price doesn't blow out the band", () => {
    const withOutlier = aggregate(
      [
        pp({ price: 300 }),
        pp({ price: 320 }),
        pp({ price: 340 }),
        pp({ price: 5000 }), // absurd sticker price
      ],
      NOW,
    );
    expect(withOutlier.band!.high).toBeLessThan(1000);
  });

  it("weights fresh observations above stale ones", () => {
    // Old cluster ~1000, fresh cluster ~300. The band should sit near fresh.
    const r = aggregate(
      [
        pp({ price: 1000, observedAt: daysAgo(150) }),
        pp({ price: 1000, observedAt: daysAgo(160) }),
        pp({ price: 300, observedAt: daysAgo(3) }),
        pp({ price: 320, observedAt: daysAgo(6) }),
        pp({ price: 310, observedAt: daysAgo(9) }),
      ],
      NOW,
    );
    expect(r.band!.high).toBeLessThan(1000);
  });
});

describe("aggregate - corroborated shops", () => {
  it("names a shop only after enough fresh sightings", () => {
    const r = aggregate(
      [
        pp({ price: 300, shopId: "shop-a", observedAt: daysAgo(4) }),
        pp({ price: 310, shopId: "shop-a", observedAt: daysAgo(9), source: "content_mined" }),
        pp({ price: 305, shopId: "shop-a", observedAt: daysAgo(14) }),
      ],
      NOW,
    );
    expect(r.basis).toBe("corroborated");
    expect(r.corroboratedShopId).toBe("shop-a");
  });

  it("does not name a shop from a single sighting", () => {
    const r = aggregate(
      [
        pp({ price: 300, shopId: "shop-a", observedAt: daysAgo(4) }),
        pp({ price: 380, observedAt: daysAgo(8) }),
        pp({ price: 420, observedAt: daysAgo(12) }),
      ],
      NOW,
    );
    expect(r.corroboratedShopId).toBeNull();
    expect(r.basis).toBe("band"); // still enough for a band, just not a shop
  });

  it("ignores stale sightings when corroborating a shop", () => {
    const r = aggregate(
      [
        pp({ price: 300, shopId: "shop-a", observedAt: daysAgo(400) }),
        pp({ price: 310, shopId: "shop-a", observedAt: daysAgo(410) }),
        pp({ price: 305, shopId: "shop-a", observedAt: daysAgo(420) }),
      ],
      NOW,
    );
    expect(r.corroboratedShopId).toBeNull();
    expect(r.basis).toBe("insufficient");
  });
});

describe("aggregate - robustness", () => {
  it("clamps future timestamps instead of trusting them", () => {
    const r = aggregate(
      [
        pp({ price: 300, observedAt: new Date(NOW.getTime() + 999 * 86_400_000) }),
        pp({ price: 320, observedAt: daysAgo(5) }),
        pp({ price: 310, observedAt: daysAgo(9) }),
      ],
      NOW,
    );
    expect(r.basis).toBe("band");
    expect(Number.isFinite(r.confidence)).toBe(true);
  });

  it("drops non-finite prices without crashing", () => {
    const r = aggregate(
      [
        pp({ price: Number.NaN }),
        pp({ price: 300, observedAt: daysAgo(5) }),
        pp({ price: 320, observedAt: daysAgo(9) }),
      ],
      NOW,
    );
    expect(r.band).not.toBeNull();
  });
});
