import { describe, expect, it } from "vitest";

import {
  isReadyToPublish,
  readinessGaps,
  MIN_DESCRIPTION_CHARS,
  type ReadinessInput,
} from "@/lib/catalog/readiness";

/**
 * What a place needs before it is allowed to face a member.
 *
 * Inventory is the ceiling on personalization, so there is real pressure to
 * publish everything - and that pressure is exactly why this bar has to hold.
 * A thin row does not raise the ceiling, it lowers the floor: it embeds to
 * almost nothing, sits in the middle of the catalog, and displaces places that
 * could actually have answered the question.
 */

const READY: ReadinessInput = {
  name: "Karim's",
  area: "Old Delhi",
  description:
    "Mutton burra off the coals till 1am, in a gali behind the Jama Masjid.",
  vibe_tags: ["hole-in-the-wall", "late-night"],
  lat: 28.65,
  lng: 77.23,
  is_chain: false,
};

const place = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  ...READY,
  ...over,
});

describe("readinessGaps", () => {
  it("passes a finished place", () => {
    expect(readinessGaps(place())).toEqual([]);
    expect(isReadyToPublish(place())).toBe(true);
  });

  it("blocks a chain outright", () => {
    // Product law, not a quality bar: chains never surface. A chain is not an
    // unfinished draft, it is one that must never be published at all - so no
    // amount of editing clears this gap.
    const chain = place({ is_chain: true });
    expect(readinessGaps(chain)).toContain("chain");
    expect(isReadyToPublish(chain)).toBe(false);
  });

  it("blocks a place with no area", () => {
    // Members ask by neighbourhood constantly. A null area does not degrade
    // gracefully, it silently drops the place out of every area-scoped search.
    expect(readinessGaps(place({ area: null }))).toContain("area");
    expect(readinessGaps(place({ area: "   " }))).toContain("area");
  });

  it("blocks a place with no vibe tags", () => {
    // Tags are the ranking vocabulary AND what `for_you` matches on, so an
    // untagged place can never produce a personal reason - it can only ever be
    // recommended generically, which is the failure this whole branch is about.
    expect(readinessGaps(place({ vibe_tags: [] }))).toContain("vibe_tags");
    expect(readinessGaps(place({ vibe_tags: null }))).toContain("vibe_tags");
  });

  it("treats a stub description as no description", () => {
    // "Popular cafe in Delhi" is what the importers produce in bulk. A hundred
    // of them embed to roughly the same vector and collapse into one
    // undifferentiated blob in the middle of the catalog.
    expect(readinessGaps(place({ description: null }))).toContain("description");
    expect(readinessGaps(place({ description: "Popular cafe." }))).toContain(
      "description",
    );
    expect(
      readinessGaps(place({ description: "x".repeat(MIN_DESCRIPTION_CHARS) })),
    ).not.toContain("description");
  });

  it("counts whitespace as absent, not as content", () => {
    expect(
      readinessGaps(place({ description: " ".repeat(MIN_DESCRIPTION_CHARS + 10) })),
    ).toContain("description");
    expect(readinessGaps(place({ name: "  " }))).toContain("name");
  });

  it("needs both coordinates, not one", () => {
    // One coordinate is worse than none: it puts the pin in the sea off Africa
    // rather than nowhere, and distance ranking then reads it as very far away.
    expect(readinessGaps(place({ lat: null }))).toContain("coordinates");
    expect(readinessGaps(place({ lng: null }))).toContain("coordinates");
    expect(readinessGaps(place({ lat: null, lng: null }))).toEqual(["coordinates"]);
  });

  it("accepts a coordinate of exactly zero", () => {
    // 0 is falsy and null is not. Delhi is nowhere near the equator, but the
    // rule is about presence, and a truthiness check here would be a bug
    // waiting for the first city that is.
    expect(readinessGaps(place({ lat: 0, lng: 0 }))).not.toContain("coordinates");
  });

  it("reports every gap at once rather than stopping at the first", () => {
    // An editor fixing one field at a time and re-checking would be a worse
    // tool than one that says everything that is wrong.
    const empty = place({
      area: null,
      description: null,
      vibe_tags: [],
      lat: null,
      lng: null,
    });
    expect(readinessGaps(empty).sort()).toEqual(
      ["area", "coordinates", "description", "vibe_tags"].sort(),
    );
  });

  it("does not block on things a good answer can live without", () => {
    // The line is drawn at what retrieval and ranking cannot work without, not
    // at what a finished listing would have. Blocking on images would hold back
    // most of the catalog for a cosmetic reason, and the pick card already
    // falls back to the place's initial.
    const noExtras: ReadinessInput & Record<string, unknown> = {
      ...place(),
      image_path: null,
      editor_note: null,
      price_level: null,
      hours: null,
    };
    expect(isReadyToPublish(noExtras)).toBe(true);
  });
});
