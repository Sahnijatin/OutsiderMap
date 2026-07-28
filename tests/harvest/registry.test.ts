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
    expect(resolveHarvestCities("delhi", ["delhi", "noida"])).toHaveLength(2);
    expect(() => resolveHarvestCities("delhi", ["atlantis"])).toThrow();
    expect(() => resolveHarvestCities("narnia", ["delhi"])).toThrow();
  });
});
