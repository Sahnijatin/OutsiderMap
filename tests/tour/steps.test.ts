import { describe, expect, it } from "vitest";
import { NAV_TOUR_IDS } from "@/lib/tour/anchors";
import {
  STEP_BY_ANCHOR,
  TOUR_ROUTES,
  TOUR_STEPS,
  TOUR_STEP_COUNT,
} from "@/lib/tour/steps";

describe("TOUR_STEPS", () => {
  it("walks the six surfaces in nav order", () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual([
      "map",
      "chat",
      "quests",
      "feed",
      "blog",
      "profile",
    ]);
    expect(TOUR_STEP_COUNT).toBe(6);
  });

  it("has unique ids and unique routes", () => {
    const ids = new Set(TOUR_STEPS.map((step) => step.id));
    const routes = new Set(TOUR_STEPS.map((step) => step.route));
    expect(ids.size).toBe(TOUR_STEPS.length);
    expect(routes.size).toBe(TOUR_STEPS.length);
  });

  it("agrees with the anchor map on every step", () => {
    // The invariant that breaks silently if someone reorders one list and not
    // the other: a step would spotlight a nav item for a different surface.
    for (const step of TOUR_STEPS) {
      expect(NAV_TOUR_IDS[step.route]).toBe(step.target);
    }
  });

  it("exposes every route through TOUR_ROUTES", () => {
    expect(TOUR_ROUTES.size).toBe(TOUR_STEP_COUNT);
    for (const step of TOUR_STEPS) {
      expect(TOUR_ROUTES.has(step.route)).toBe(true);
    }
  });

  it("round-trips every anchor back to its index", () => {
    TOUR_STEPS.forEach((step, index) => {
      expect(STEP_BY_ANCHOR.get(step.target)).toBe(index);
    });
    expect(STEP_BY_ANCHOR.size).toBe(TOUR_STEP_COUNT);
  });
});

describe("tour copy", () => {
  it("is trimmed and free of double spaces", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title).toBe(step.title.trim());
      expect(step.body).toBe(step.body.trim());
      expect(step.title).not.toMatch(/ {2}/);
      expect(step.body).not.toMatch(/ {2}/);
    }
  });

  it("keeps bodies short enough for a 390px panel", () => {
    for (const step of TOUR_STEPS) {
      expect(step.body.length).toBeLessThanOrEqual(160);
      expect(step.title.length).toBeLessThanOrEqual(48);
    }
  });

  it("is written as sentences", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title).toMatch(/[.?!]$/);
      expect(step.body).toMatch(/[.?!]$/);
    }
  });
});
