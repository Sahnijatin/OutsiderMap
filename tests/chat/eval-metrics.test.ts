import { describe, expect, it } from "vitest";

import {
  bannedPhrasesIn,
  matchedTokens,
  modelReasonShare,
  pickOverlap,
  reasonSpecificity,
  recitationRate,
  recitesProfile,
} from "@/lib/chat/eval/metrics";
import { BANNED_PHRASES } from "@/lib/chat/voice";

/**
 * The scoring layer of the personalization eval (plan step 1). Pure functions,
 * so this whole file runs in CI with no key and no database - which is the
 * point: the numbers that gate the work should not themselves depend on the
 * thing being measured.
 */

describe("pickOverlap", () => {
  it("is 1 when every persona got the same places", () => {
    const result = pickOverlap([
      { personaId: "a", slugs: ["karims", "lota"] },
      { personaId: "b", slugs: ["lota", "karims"] },
    ]);
    expect(result.overlap).toBe(1);
    expect(result.comparedPersonas).toBe(2);
  });

  it("is 0 when the sets are disjoint", () => {
    const result = pickOverlap([
      { personaId: "a", slugs: ["karims"] },
      { personaId: "b", slugs: ["lota"] },
    ]);
    expect(result.overlap).toBe(0);
  });

  it("measures partial overlap as Jaccard", () => {
    // {a,b} vs {b,c}: intersection 1, union 3.
    const result = pickOverlap([
      { personaId: "x", slugs: ["a", "b"] },
      { personaId: "y", slugs: ["b", "c"] },
    ]);
    expect(result.overlap).toBeCloseTo(1 / 3);
  });

  it("averages over every unordered pair", () => {
    // ab/ab = 1, ab/cd = 0, ab/cd = 0 -> pairs: (1,2)=1 (1,3)=0 (2,3)=0
    const result = pickOverlap([
      { personaId: "1", slugs: ["a", "b"] },
      { personaId: "2", slugs: ["a", "b"] },
      { personaId: "3", slugs: ["c", "d"] },
    ]);
    expect(result.overlap).toBeCloseTo(1 / 3);
  });

  it("excludes personas that got no picks instead of counting them as divergent", () => {
    // The regression this guards: an empty set looks maximally different from
    // every other set, so folding failed turns in would make a broken product
    // score as perfectly personalized.
    const result = pickOverlap([
      { personaId: "a", slugs: ["karims"] },
      { personaId: "b", slugs: ["karims"] },
      { personaId: "c", slugs: [] },
    ]);
    expect(result.overlap).toBe(1);
    expect(result.comparedPersonas).toBe(2);
    expect(result.skippedEmpty).toBe(1);
  });

  it("reports null rather than a number when fewer than two personas produced picks", () => {
    expect(pickOverlap([{ personaId: "a", slugs: ["x"] }]).overlap).toBeNull();
    expect(pickOverlap([]).overlap).toBeNull();
  });
});

describe("matchedTokens", () => {
  it("matches a hyphenated vibe tag written as prose", () => {
    expect(
      matchedTokens("the kind of hole in the wall that closes at 3am", [
        "hole-in-the-wall",
      ]),
    ).toEqual(["hole-in-the-wall"]);
  });

  it("tolerates a plural in the profile against a singular in the reply", () => {
    expect(matchedTokens("the paratha is the whole point", ["parathas"])).toEqual(
      ["parathas"],
    );
  });

  it("matches on word boundaries, not substrings", () => {
    // "art" must not fire on "started".
    expect(matchedTokens("they started at noon", ["art"])).toEqual([]);
    expect(matchedTokens("the art on the back wall", ["art"])).toEqual(["art"]);
  });

  it("ignores tokens too short to be evidence of anything", () => {
    expect(matchedTokens("a b c", ["a", "of"])).toEqual([]);
  });

  it("is case and punctuation insensitive", () => {
    expect(
      matchedTokens("Right by Khan Market, upstairs.", ["khan market"]),
    ).toEqual(["khan market"]);
  });

  it("reasonSpecificity is the boolean form", () => {
    expect(reasonSpecificity("quiet, with books", ["books"])).toBe(true);
    expect(reasonSpecificity("quiet, with books", ["cocktails"])).toBe(false);
  });
});

describe("modelReasonShare", () => {
  it("counts only reasons the model wrote for this member", () => {
    expect(
      modelReasonShare([
        { reasonSource: "model" },
        { reasonSource: "editor_note" },
      ]),
    ).toBe(0.5);
  });

  it("treats a missing source as an editor note, per the field's contract", () => {
    expect(modelReasonShare([{}, { reasonSource: "model" }])).toBe(0.5);
  });

  it("is null with nothing to measure", () => {
    expect(modelReasonShare([])).toBeNull();
  });
});

describe("bannedPhrasesIn", () => {
  it("finds a literal banned phrase regardless of case", () => {
    expect(bannedPhrasesIn("A genuine Hidden Gem of a place")).toContain(
      "hidden gem",
    );
  });

  it("finds a hyphenated phrase written unhyphenated", () => {
    expect(bannedPhrasesIn("an absolute must visit")).toContain("must-visit");
  });

  it("finds the templated whether-you're construction", () => {
    expect(
      bannedPhrasesIn("Whether you're after quiet or a crowd, this works."),
    ).toContain("whether you're X or Y");
  });

  it("does not fire on innocent uses of the same words", () => {
    expect(bannedPhrasesIn("Whether or not they are open, go early.")).toEqual(
      [],
    );
    expect(bannedPhrasesIn("Karim's does the burra till 1am.")).toEqual([]);
  });

  it("has a working detector for every phrase the prompt bans", () => {
    // The drift guard: if someone adds a phrase to the prompt's banned list,
    // the eval must be able to find it, or the rule is unenforceable.
    for (const banned of BANNED_PHRASES) {
      if (banned.detect) {
        expect(banned.detect.source.length).toBeGreaterThan(0);
        continue;
      }
      expect(bannedPhrasesIn(`prefix ${banned.phrase} suffix`)).toContain(
        banned.phrase,
      );
    }
  });
});

describe("recitesProfile", () => {
  it.each([
    "As someone who loves hole-in-the-wall spots, you'll enjoy this.",
    "Since you love late nights, Karim's it is.",
    "Based on your taste, try the courtyard.",
    "This is right up your alley.",
    "Your usual haunt is closed, so try this.",
    "Given your taste for quiet rooms, go early.",
  ])("flags profile narration: %s", (line) => {
    expect(recitesProfile(line).length).toBeGreaterThan(0);
  });

  it.each([
    // The picks themselves may absolutely name taste words - about the PLACE.
    "Karim's does the mutton burra till 1am, and the gali is half the point.",
    "A hole-in-the-wall that stays open past 2.",
    // Leaning on the ask is not reciting the profile.
    "Since you're in GK2, this is the closest one still open.",
    "Given your budget of 200, this is the one.",
    "Whether or not it rains, the courtyard works.",
  ])("does not flag legitimate specificity: %s", (line) => {
    expect(recitesProfile(line)).toEqual([]);
  });

  it("rate is the share of replies that recite", () => {
    expect(
      recitationRate(["As someone who loves chai, go here.", "Go here."]),
    ).toBe(0.5);
    expect(recitationRate([])).toBeNull();
  });
});
