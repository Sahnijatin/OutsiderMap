import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { filterByAreas, resolveAreaFilter } from "@/lib/catalog/regions";
import type { CatalogCandidate } from "@/lib/catalog/search";

const CITY_AREAS = [
  "Khan Market",
  "Greater Kailash",
  "Hauz Khas",
  "Rajouri Garden",
  "Janakpuri",
  "Dwarka",
  "Punjabi Bagh",
];

describe("resolveAreaFilter", () => {
  it("canonicalizes a known neighbourhood case-insensitively", () => {
    expect(resolveAreaFilter("khan market", CITY_AREAS)).toEqual({
      kind: "area",
      area: "Khan Market",
    });
  });

  it('expands "west delhi" to its catalog-known neighbourhoods', () => {
    const result = resolveAreaFilter("West Delhi", CITY_AREAS);
    expect(result.kind).toBe("region");
    if (result.kind !== "region") throw new Error("expected region");
    expect(result.areas.sort()).toEqual(
      ["Dwarka", "Janakpuri", "Punjabi Bagh", "Rajouri Garden"].sort(),
    );
  });

  it('treats a bare direction ("south") as its Delhi region', () => {
    const result = resolveAreaFilter("south", CITY_AREAS);
    expect(result.kind).toBe("region");
    if (result.kind !== "region") throw new Error("expected region");
    // Only areas the city actually has survive the intersection.
    expect(result.areas.sort()).toEqual(["Greater Kailash", "Hauz Khas"].sort());
  });

  it("reports the unmatched ask instead of silently dropping it", () => {
    // The original bug: "West Delhi" failed a case-sensitive includes() and
    // the filter died silently - city-wide picks got labeled West Delhi.
    expect(resolveAreaFilter("Timbuktu", CITY_AREAS)).toEqual({
      kind: "unmatched",
      requested: "Timbuktu",
    });
  });

  it("is none when no area was asked for", () => {
    expect(resolveAreaFilter(null, CITY_AREAS)).toEqual({ kind: "none" });
    expect(resolveAreaFilter("  ", CITY_AREAS)).toEqual({ kind: "none" });
  });

  it("falls to unmatched when a region has no member areas in this city", () => {
    expect(resolveAreaFilter("west delhi", ["Khan Market"])).toEqual({
      kind: "unmatched",
      requested: "west delhi",
    });
  });
});

const candidate = (slug: string, area: string | null): CatalogCandidate =>
  ({ slug, area }) as CatalogCandidate;

describe("filterByAreas", () => {
  const pool = [
    candidate("a", "Rajouri Garden"),
    candidate("b", "Janakpuri"),
    candidate("c", "Khan Market"),
    candidate("d", "Dwarka"),
  ];

  it("keeps only candidates inside the region when enough remain", () => {
    const { candidates, relaxed } = filterByAreas(
      pool,
      ["Rajouri Garden", "Janakpuri", "Dwarka"],
      3,
    );
    expect(candidates.map((c) => c.slug)).toEqual(["a", "b", "d"]);
    expect(relaxed).toBe(false);
  });

  it("relaxes to the full pool when the region starves it - and says so", () => {
    const { candidates, relaxed } = filterByAreas(pool, ["Rajouri Garden"], 3);
    expect(candidates).toHaveLength(4);
    expect(relaxed).toBe(true);
  });
});
