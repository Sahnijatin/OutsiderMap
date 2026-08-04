import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  AREA_CONFIDENT,
  classifyArea,
  summarizeCoverage,
} from "@/lib/catalog/coverage";

/**
 * Per-area coverage (#124). The interesting cases are the boundaries of the
 * three states and the two ways an area can be wrong without looking wrong:
 * declared but empty (a dead zone that answers city-wide instead), and
 * populated but undeclared (published places no area-scoped ask can reach).
 */

describe("classifyArea", () => {
  it("treats an empty area as dead, not thin", () => {
    expect(classifyArea(0)).toBe("dead");
    // Negative can't happen from a tally, but the boundary shouldn't invert.
    expect(classifyArea(-1)).toBe("dead");
  });

  it("is thin right up to the retrieval floor, covered at it", () => {
    expect(classifyArea(1)).toBe("thin");
    expect(classifyArea(AREA_CONFIDENT - 1)).toBe("thin");
    expect(classifyArea(AREA_CONFIDENT)).toBe("covered");
  });
});

describe("summarizeCoverage", () => {
  it("counts a declared area with no places as dead", () => {
    const s = summarizeCoverage(
      ["Connaught Place", "Indirapuram"],
      new Map([["Connaught Place", 20]]),
    );
    expect(s.dead).toBe(1);
    expect(s.covered).toBe(1);
    expect(s.areas.find((a) => a.area === "Indirapuram")).toEqual({
      area: "Indirapuram",
      retrievable: 0,
      state: "dead",
    });
  });

  it("orders worst-first so the list reads as a work queue", () => {
    const s = summarizeCoverage(
      ["A", "B", "C"],
      new Map([
        ["A", 30],
        ["B", 0],
        ["C", 4],
      ]),
    );
    expect(s.areas.map((a) => a.area)).toEqual(["B", "C", "A"]);
  });

  it("breaks ties alphabetically so the order is stable across runs", () => {
    const s = summarizeCoverage(["Zeta", "Alpha"], new Map());
    expect(s.areas.map((a) => a.area)).toEqual(["Alpha", "Zeta"]);
  });

  it("counts places in undeclared areas as unplaced, not as coverage", () => {
    // "Gurgaon " with a stray space is published and retrievable city-wide, but
    // no area-scoped ask will ever match it.
    const s = summarizeCoverage(
      ["Gurgaon"],
      new Map([
        ["Gurgaon", 5],
        ["Gurgaon ", 3],
        ["Sector 44", 2],
      ]),
    );
    expect(s.unplaced).toBe(5);
    expect(s.areas).toHaveLength(1);
    expect(s.areas[0].retrievable).toBe(5);
  });

  it("reports every area dead when the catalog is empty", () => {
    const s = summarizeCoverage(["A", "B"], new Map());
    expect(s).toMatchObject({ dead: 2, thin: 0, covered: 0, unplaced: 0 });
  });

  it("handles a city with no declared areas without inventing coverage", () => {
    const s = summarizeCoverage([], new Map([["Somewhere", 9]]));
    expect(s.areas).toEqual([]);
    expect(s.unplaced).toBe(9);
  });
});
