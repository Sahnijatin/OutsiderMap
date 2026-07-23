import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aggregate } from "@/lib/market/intelligence";
import type { PricePoint } from "@/lib/market/types";

/**
 * Guards the Delhi v1 seed (data/markets.delhi.json): it must be well-formed
 * AND dense enough that the real aggregator returns genuine price bands on day
 * one - otherwise "market mode" ships answering "no data yet" for every ask.
 */

type SeedPoint = {
  category: string;
  item?: string;
  price: number;
  recency: "recent" | "weeks" | "months" | "unknown";
  confidence: "high" | "medium" | "low";
};
type SeedMarket = {
  slug: string;
  name: string;
  categories: string[];
  sections: { name: string; specialization: string | null }[];
  guides: {
    category: string;
    price_band_low: number | null;
    price_band_high: number | null;
    confidence: number;
  }[];
  price_points: SeedPoint[];
};

const markets: SeedMarket[] = JSON.parse(
  readFileSync(new URL("../../data/markets.delhi.json", import.meta.url), "utf8"),
);

// The seeder's recency mapping, mirrored (kept in sync with seed-markets.mjs).
const NOW = new Date("2026-07-22T00:00:00Z");
const CONF = { high: 0.7, medium: 0.5, low: 0.3 } as const;
function toPricePoint(p: SeedPoint): PricePoint {
  const days = { recent: 7, weeks: 21, months: 75, unknown: null }[p.recency];
  return {
    price: p.price,
    source: "content_mined",
    confidence: CONF[p.confidence],
    observedAt: days == null ? null : new Date(NOW.getTime() - days * 86_400_000),
  };
}

describe("Delhi market seed - shape", () => {
  it("seeds the five flagship markets", () => {
    const slugs = markets.map((m) => m.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        "sarojini-nagar",
        "lajpat-nagar",
        "karol-bagh",
        "nehru-place",
        "chandni-chowk",
      ]),
    );
  });

  it("every market has lanes, guides, and points", () => {
    for (const m of markets) {
      expect(m.name, m.slug).toBeTruthy();
      expect(m.sections.length, m.slug).toBeGreaterThan(0);
      expect(m.guides.length, m.slug).toBeGreaterThan(0);
      expect(m.price_points.length, m.slug).toBeGreaterThan(0);
    }
  });

  it("guide bands are ordered low <= high and prices are positive ints", () => {
    for (const m of markets) {
      for (const g of m.guides) {
        if (g.price_band_low != null && g.price_band_high != null) {
          expect(g.price_band_low, `${m.slug}/${g.category}`).toBeLessThanOrEqual(
            g.price_band_high,
          );
        }
      }
      for (const p of m.price_points) {
        expect(Number.isInteger(p.price) && p.price > 0, `${m.slug}/${p.category}`).toBe(
          true,
        );
      }
    }
  });
});

describe("Delhi market seed - produces real bands", () => {
  it("every category with 2+ seeded points aggregates to a band, not 'insufficient'", () => {
    let checked = 0;
    for (const m of markets) {
      const byCategory = new Map<string, PricePoint[]>();
      for (const p of m.price_points) {
        const bucket = byCategory.get(p.category) ?? [];
        bucket.push(toPricePoint(p));
        byCategory.set(p.category, bucket);
      }
      for (const [category, points] of byCategory) {
        if (points.length < 2) continue;
        const result = aggregate(points, NOW);
        expect(result.basis, `${m.slug}/${category}`).not.toBe("insufficient");
        expect(result.band, `${m.slug}/${category}`).not.toBeNull();
        expect(result.band!.low).toBeLessThanOrEqual(result.band!.high);
        checked += 1;
      }
    }
    // Sanity: we actually exercised several markets, not zero.
    expect(checked).toBeGreaterThanOrEqual(5);
  });
});
