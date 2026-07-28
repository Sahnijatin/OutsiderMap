import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  HARVEST_CATEGORIES,
  HARVEST_STATES,
  harvestCityBySlug,
  resolveHarvestCities,
} from "@/lib/harvest/registry";

const PLACE_KINDS = new Set([
  "spot", "cafe", "nightlife", "workshop", "historical", "cultural", "event",
]);

describe("harvest registry", () => {
  it("maps every NCR harvest city into the one delhi product city", () => {
    for (const city of HARVEST_STATES.delhi.cities) {
      expect(city.productCity).toBe("delhi");
    }
  });

  it("leaves not-yet-live cities unpublishable (null productCity)", () => {
    expect(harvestCityBySlug("mumbai")?.productCity).toBeNull();
  });

  it("every category maps to a real catalog kind", () => {
    for (const [key, def] of Object.entries(HARVEST_CATEGORIES)) {
      expect(PLACE_KINDS.has(def.kind), `${key} -> ${def.kind}`).toBe(true);
    }
  });

  it("resolves selected cities and rejects unknown ones", () => {
    expect(
      resolveHarvestCities(HARVEST_STATES, "delhi", ["delhi", "noida"]),
    ).toHaveLength(2);
    expect(() =>
      resolveHarvestCities(HARVEST_STATES, "delhi", ["atlantis"]),
    ).toThrow();
    expect(() =>
      resolveHarvestCities(HARVEST_STATES, "narnia", ["delhi"]),
    ).toThrow();
  });

  it("covers every Indian state and union territory", () => {
    // 28 states + Delhi + 7 other UTs, with NCR grouped under delhi.
    expect(Object.keys(HARVEST_STATES).length).toBeGreaterThanOrEqual(36);
    for (const [slug, state] of Object.entries(HARVEST_STATES)) {
      expect(state.cities.length, `${slug} has no cities`).toBeGreaterThan(0);
    }
  });

  it("keeps city slugs unique and coordinates inside India", () => {
    const seen = new Set<string>();
    for (const state of Object.values(HARVEST_STATES)) {
      for (const c of state.cities) {
        expect(seen.has(c.slug), `duplicate slug ${c.slug}`).toBe(false);
        seen.add(c.slug);
        expect(c.lat).toBeGreaterThan(6);
        expect(c.lat).toBeLessThan(38);
        expect(c.lng).toBeGreaterThan(66);
        expect(c.lng).toBeLessThan(98);
        expect(c.radiusM).toBeGreaterThanOrEqual(1000);
        expect(c.radiusM).toBeLessThanOrEqual(50000);
      }
    }
  });
});
