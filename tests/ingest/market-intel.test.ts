import { describe, expect, it } from "vitest";
import {
  candidateToPricePoint,
  minedConfidence,
  recencyToObservedAt,
  type MarketIntelCandidate,
} from "@/lib/ingest/market-intel";

const NOW = new Date("2026-07-22T00:00:00Z");

function candidate(over: Partial<MarketIntelCandidate> = {}): MarketIntelCandidate {
  return {
    market_slug_guess: "sarojini-nagar",
    city: "delhi",
    section: null,
    category: "fashion",
    item: "denim jacket",
    price: 400,
    currency: "INR",
    recency: "recent",
    recommendation: "back lane, quote low",
    confidence: "medium",
    ...over,
  };
}

describe("minedConfidence", () => {
  it("maps labels to weights, high > medium > low", () => {
    expect(minedConfidence("high")).toBeGreaterThan(minedConfidence("medium"));
    expect(minedConfidence("medium")).toBeGreaterThan(minedConfidence("low"));
  });
});

describe("recencyToObservedAt", () => {
  it("places fuzzy recency conservatively in the past", () => {
    expect(recencyToObservedAt("recent", NOW)!.getTime()).toBeLessThan(NOW.getTime());
    const weeks = recencyToObservedAt("weeks", NOW)!;
    const months = recencyToObservedAt("months", NOW)!;
    expect(months.getTime()).toBeLessThan(weeks.getTime());
  });

  it("leaves unknown recency undated", () => {
    expect(recencyToObservedAt("unknown", NOW)).toBeNull();
  });
});

describe("candidateToPricePoint", () => {
  const ctx = { marketId: "m1", sourceRef: "https://x/haul", now: NOW };

  it("stages a pending, content_mined, shopless row", () => {
    const row = candidateToPricePoint(candidate(), ctx);
    expect(row).not.toBeNull();
    expect(row!.source).toBe("content_mined");
    expect(row!.status).toBe("pending");
    expect(row!.shop_id).toBeNull();
    expect(row!.market_id).toBe("m1");
    expect(row!.source_ref).toBe("https://x/haul");
  });

  it("never names a shop even if the candidate mentions one", () => {
    // The schema has no shop field; a mined row is structurally shopless.
    const row = candidateToPricePoint(candidate({ category: "ethnic" }), ctx);
    expect(row!.shop_id).toBeNull();
  });

  it("drops observations with no price (nothing to aggregate)", () => {
    expect(candidateToPricePoint(candidate({ price: null }), ctx)).toBeNull();
  });

  it("carries the confidence weight and dated recency through", () => {
    const row = candidateToPricePoint(candidate({ confidence: "high" }), ctx);
    expect(row!.confidence).toBe(minedConfidence("high"));
    expect(row!.observed_at).not.toBeNull();
  });

  it("leaves observed_at null for unknown recency", () => {
    const row = candidateToPricePoint(candidate({ recency: "unknown" }), ctx);
    expect(row!.observed_at).toBeNull();
  });
});
