import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { forYou } from "@/lib/chat/for-you";
import type { Persona } from "@/lib/chat/persona";

/**
 * Per-candidate evidence: the half of a search result that says why THIS place
 * suits THIS member, separated from how well it answers the ask.
 */

const READER: Persona = {
  firstName: "Ira",
  anchors: ["reads for three hours and orders once"],
  cuisines: ["third-wave-coffee"],
  budgetBand: 2,
  social: "solo",
  preferredTimes: ["afternoon"],
  vibes: ["study-spot", "books", "minimal"],
  avoidVibes: ["loud-music", "big-group"],
  areas: ["Khan Market", "Lodhi Colony"],
  activeHours: "afternoons",
  posture: "exploit",
  guidance: "Lead with places squarely in it.",
  savedRecently: ["Cafe Lota"],
  passedRecently: [],
  eventCount: 51,
};

const place = (over: Partial<Parameters<typeof forYou>[0]> = {}) => ({
  name: "Some Cafe",
  area: "Khan Market",
  price_level: 2,
  vibe_tags: ["study-spot", "cozy"],
  ...over,
});

describe("forYou", () => {
  it("names the member's own vibes that this place has", () => {
    // The point of the whole exercise: "study-spot" is quotable in a reason,
    // a blended cosine of 0.62 is not.
    expect(forYou(place(), READER)?.matches).toEqual(["study-spot"]);
  });

  it("flags a place in an area they actually go to", () => {
    expect(forYou(place(), READER)?.their_area).toBe(true);
    expect(forYou(place({ area: "Paharganj" }), READER)?.their_area).toBeUndefined();
  });

  it("surfaces a clash rather than filtering it out", () => {
    // "Somewhere loud for once" is a legitimate ask from someone who usually
    // avoids loud rooms. Only the model, which can see the ask, can tell that
    // apart from a mismatch - so this reports, it does not veto.
    const loud = place({ vibe_tags: ["loud-music", "big-group", "study-spot"] });
    const evidence = forYou(loud, READER);
    expect(evidence?.clashes).toEqual(["loud-music", "big-group"]);
    expect(evidence?.matches).toEqual(["study-spot"]);
  });

  it("marks a place above their usual band, and stays quiet within it", () => {
    expect(forYou(place({ price_level: 4 }), READER)?.above_budget).toBe(true);
    expect(forYou(place({ price_level: 2 }), READER)?.above_budget).toBeUndefined();
    expect(forYou(place({ price_level: 1 }), READER)?.above_budget).toBeUndefined();
  });

  it("recognises somewhere they already saved", () => {
    expect(forYou(place({ name: "Cafe Lota" }), READER)?.saved_before).toBe(true);
    expect(forYou(place({ name: "cafe lota" }), READER)?.saved_before).toBe(true);
  });

  it("matches tags case-insensitively", () => {
    expect(forYou(place({ vibe_tags: ["Study-Spot"] }), READER)?.matches).toEqual([
      "Study-Spot",
    ]);
  });

  it("returns null when there is nothing personal to say", () => {
    // Not an empty object: `for_you: {}` on every result would spend tokens
    // saying nothing and teach the model to skip the field where it matters.
    const stranger = place({
      area: "Paharganj",
      price_level: 1,
      vibe_tags: ["kebab", "late-night"],
      name: "Somewhere Else",
    });
    expect(forYou(stranger, READER)).toBeNull();
  });

  it("returns null without a member", () => {
    // Consent: personalization off means no evidence, not thinner evidence.
    expect(forYou(place(), null)).toBeNull();
  });

  it("says nothing about a member we know nothing about", () => {
    const blank: Persona = {
      ...READER,
      vibes: [],
      avoidVibes: [],
      areas: [],
      budgetBand: 0,
      savedRecently: [],
      eventCount: 0,
    };
    expect(forYou(place(), blank)).toBeNull();
  });

  it("handles a place with no area or price", () => {
    const sparse = place({ area: null, price_level: null, vibe_tags: [] });
    expect(forYou(sparse, READER)).toBeNull();
  });
});
