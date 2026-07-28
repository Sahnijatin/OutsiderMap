import { describe, expect, it } from "vitest";

import { recencyFactor } from "@/lib/taste/learn";

/**
 * Recency decay on the learning loop.
 *
 * The loop reads the last 500 events and, until now, counted all of them
 * equally - so a burst of saves from six months ago outvoted last week in a
 * profile whose own embedding text says "Lately drawn to". These pin the shape
 * of the curve and, more importantly, its failure modes: a bad `created_at`
 * must never produce NaN or Infinity, because that would poison every tag on
 * the place and silently reorder someone's whole profile.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-28T00:00:00.000Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

describe("recencyFactor", () => {
  it("counts something that just happened in full", () => {
    expect(recencyFactor(ago(0), NOW)).toBe(1);
  });

  it("halves at the half-life and quarters at two", () => {
    expect(recencyFactor(ago(60), NOW)).toBeCloseTo(0.5, 6);
    expect(recencyFactor(ago(120), NOW)).toBeCloseTo(0.25, 6);
  });

  it("decays smoothly rather than in steps", () => {
    // A step function would make the ordering of two events either side of a
    // boundary jump for no reason a member could perceive.
    const week = recencyFactor(ago(7), NOW);
    expect(week).toBeLessThan(1);
    expect(week).toBeGreaterThan(recencyFactor(ago(8), NOW));
  });

  it("still counts old signal for something, rather than erasing it", () => {
    // The full 500-event window is a year or more for an active member. Decay
    // should re-weight that history, not delete it - a member with one strong
    // old habit and no recent activity must still have a profile.
    expect(recencyFactor(ago(365), NOW)).toBeGreaterThan(0);
  });

  it("treats a future timestamp as now instead of amplifying it", () => {
    // Clock skew between the client writing the event and the server reading it
    // is real. Without the clamp, 0.5 ** negative is greater than 1 - a single
    // skewed row would outweigh everything honest around it.
    expect(recencyFactor(new Date(NOW + DAY).toISOString(), NOW)).toBe(1);
  });

  it("treats an unparseable timestamp as now instead of as NaN", () => {
    // NaN propagates: one bad row would turn every tag score on that place into
    // NaN, and NaN sorts unpredictably. Full weight is the safe wrong answer.
    expect(recencyFactor("not a date", NOW)).toBe(1);
  });

  it("leaves ratios between tags on one event untouched", () => {
    // The explore/exploit dial reads shares, not magnitudes, so decay must not
    // move it. Two tags on the same event scale by the same factor.
    const factor = recencyFactor(ago(30), NOW);
    expect((3 * factor) / (1 * factor)).toBeCloseTo(3, 6);
  });
});
