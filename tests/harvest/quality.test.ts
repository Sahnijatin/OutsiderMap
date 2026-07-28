import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { gateReason, isLikelyChain, qualityScore } from "@/lib/harvest/quality";

const base = {
  name: "Cafe Lota",
  rating: 4.5,
  reviewCount: 2000,
  sources: ["google"],
  storySignals: [{}, {}],
};

describe("gateReason", () => {
  const opts = { minRating: 4.3, minReviews: 300 };

  it("passes a well-rated independent place", () => {
    expect(gateReason(base, opts)).toBeNull();
  });

  it("blocks chains by product law - including field-caught ones", () => {
    expect(isLikelyChain("Coffeeshop Company CP")).toBe(true);
    expect(isLikelyChain("Nothing Before Coffee - Saket")).toBe(true);
    expect(gateReason({ ...base, name: "Domino's Pizza" }, opts)).toBe("chain blocklist");
  });

  it("names the exact reason for threshold failures", () => {
    expect(gateReason({ ...base, rating: 4.1 }, opts)).toContain("4.1 < 4.3");
    expect(gateReason({ ...base, reviewCount: 50 }, opts)).toContain("50 reviews < 300");
    expect(gateReason({ ...base, rating: null, reviewCount: null }, opts)).toContain(
      "no rating evidence",
    );
  });
});

describe("qualityScore", () => {
  it("rewards rating, reviews, corroboration and story evidence", () => {
    const strong = qualityScore({
      ...base,
      sources: ["google", "osm"],
      storySignals: [{}, {}, {}, {}],
    });
    const weak = qualityScore({ ...base, rating: 4.0, reviewCount: 100, storySignals: [] });
    expect(strong).toBeGreaterThan(weak);
  });

  it("penalizes SEO-stuffed listing names", () => {
    const honest = qualityScore(base);
    const stuffed = qualityScore({
      ...base,
      name: "Cafe Lota, Best Cafe in Chittaranjan Park Delhi",
    });
    expect(stuffed).toBeLessThan(honest);
  });
});
