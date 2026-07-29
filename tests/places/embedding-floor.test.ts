import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isEmbeddable, novelWordCount } from "@/lib/places/embedding";

/**
 * The quality floor on the embedding write.
 *
 * `match_places` filters `embedding is not null`, so this decides what chat,
 * search and recommendations can see - on every publish path, including the
 * ones that never touch the admin readiness gate. Getting it wrong in one
 * direction hides real places; in the other it lets stubs back into the
 * shortlist. Both are quiet failures, which is why this file is long.
 */

/** Mirrors EmbeddablePlace; written out so `null` overrides typecheck. */
type Place = {
  name: string;
  category: string | null;
  area: string | null;
  vibe_tags: string[];
  description: string | null;
  editor_note: string | null;
  best_for: null;
  price_level: number | null;
};

const base: Place = {
  name: "Karim's",
  category: "kebab",
  area: "Old Delhi",
  vibe_tags: [],
  description: null,
  editor_note: null,
  best_for: null,
  price_level: null,
};

const place = (over: Partial<Place> = {}): Place => ({ ...base, ...over });

const REAL_COPY =
  "Mutton burra off the coals until one in the morning, in a gali behind " +
  "the Jama Masjid where the queue is half the evening.";

describe("isEmbeddable", () => {
  it("passes a place with real copy", () => {
    expect(isEmbeddable(place({ description: REAL_COPY }))).toBe(true);
  });

  it("passes a place with tags even when the prose is thin", () => {
    // Tags are genuinely matchable vocabulary and are exactly what `for_you`
    // reads, so a tagged place can be both found and explained. One tag is
    // enough to be a real answer to a real ask.
    expect(isEmbeddable(place({ vibe_tags: ["late-night"] }))).toBe(true);
  });

  it("refuses a row with nothing but its name, category and area", () => {
    expect(isEmbeddable(place())).toBe(false);
  });

  it("refuses the harvest approve fallback verbatim", () => {
    // The regression that motivated the floor. When copy generation fails at
    // approve time, `approve.ts` writes exactly this and publishes it live:
    // a description restating the skeleton, a boilerplate note, and no tags.
    const fallback = place({
      description: "Karim's - a kebab in Old Delhi.",
      editor_note: "Scouted and verified by the desk.",
      vibe_tags: [],
    });
    expect(isEmbeddable(fallback)).toBe(false);
  });

  it("refuses a description that only restates the name", () => {
    // "Has a description" is not the test - the stubs have one. What matters
    // is whether anything here could be searched for.
    expect(
      isEmbeddable(place({ description: "Karim's, a kebab place in Old Delhi" })),
    ).toBe(false);
  });

  it("counts the editor note as content too", () => {
    // A place with a one-line local tip and no description is still findable;
    // the note is in the embedding text and says something real.
    expect(isEmbeddable(place({ editor_note: REAL_COPY }))).toBe(true);
  });

  it("is not fooled by repeating one word", () => {
    // Length alone would pass this. Distinct words is the measure, because a
    // vector built from one repeated token carries one token of signal.
    const padded = place({ description: "special ".repeat(40) });
    expect(isEmbeddable(padded)).toBe(false);
  });

  it("ignores case and punctuation when deciding what is novel", () => {
    expect(
      isEmbeddable(place({ description: "KARIM'S -- kebab, kebab; Old Delhi!" })),
    ).toBe(false);
  });

  it("handles a place with no category or area", () => {
    // Both are nullable, and the skeleton is built from them. A row missing
    // them must not throw, and must not accidentally pass because the
    // comparison set is empty.
    expect(isEmbeddable(place({ category: null, area: null }))).toBe(false);
    expect(
      isEmbeddable(place({ category: null, area: null, description: REAL_COPY })),
    ).toBe(true);
  });
});

describe("novelWordCount", () => {
  it("counts only what the name, category and area do not already say", () => {
    // The whole point: these words are already in the embedding text via the
    // skeleton line, so repeating them adds no way to find the place.
    expect(novelWordCount(place({ description: "Karim's kebab Old Delhi" }))).toBe(0);
  });

  it("counts a distinct word once, however often it appears", () => {
    expect(novelWordCount(place({ description: "burra burra burra" }))).toBe(1);
  });

  it("ignores very short words", () => {
    // "in", "a", "of" are in every description ever written and distinguish
    // nothing, so they must not push a stub over the line.
    expect(novelWordCount(place({ description: "a in of by to" }))).toBe(0);
  });

  it("is zero for a row with no prose at all", () => {
    expect(novelWordCount(place())).toBe(0);
  });

  it("grows with real content", () => {
    expect(novelWordCount(place({ description: REAL_COPY }))).toBeGreaterThan(12);
  });
});
