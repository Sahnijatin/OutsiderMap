import { describe, expect, it } from "vitest";
import {
  normalizeQuizDraft,
  quizDraftKey,
  quizDraftSnapshot,
  writeQuizDraft,
} from "@/lib/setup/draft";
import { QUIZ } from "@/lib/taste/quiz";

/**
 * The quiz draft's parsing rules. A draft is read from localStorage, which is
 * to say from something a previous release wrote, a browser extension may have
 * touched, and a user can hand-edit - so the only interesting cases are the
 * malformed ones. A bad draft must degrade to an empty quiz, never break a
 * fresh one.
 */

describe("normalizeQuizDraft - valid input", () => {
  it("round-trips answers and index", () => {
    const draft = {
      answers: { hours: "after-dark", areas: ["Saket", "Hauz Khas"] },
      index: 3,
    };
    expect(normalizeQuizDraft(draft)).toEqual(draft);
  });

  it("accepts an empty draft", () => {
    expect(normalizeQuizDraft({ answers: {}, index: 0 })).toEqual({
      answers: {},
      index: 0,
    });
  });
});

describe("normalizeQuizDraft - malformed input", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "nope"],
    ["a number", 42],
    ["an array", [1, 2, 3]],
    ["an empty object", {}],
  ])("returns an empty draft for %s", (_label, input) => {
    expect(normalizeQuizDraft(input)).toEqual({ answers: {}, index: 0 });
  });

  it("ignores a non-object answers field", () => {
    expect(normalizeQuizDraft({ answers: "hours", index: 1 })).toEqual({
      answers: {},
      index: 1,
    });
  });
});

describe("normalizeQuizDraft - answer values", () => {
  // AnswersSchema on the server accepts only strings and string arrays. A
  // draft carrying anything else would fail the final submit, so it is dropped
  // here instead.
  it("drops values the server would reject", () => {
    const { answers } = normalizeQuizDraft({
      answers: {
        good: "keep",
        alsoGood: ["keep", "these"],
        aNumber: 4,
        aBool: true,
        nested: { no: 1 },
        mixedArray: ["a", 2],
        nullish: null,
      },
      index: 0,
    });
    expect(answers).toEqual({ good: "keep", alsoGood: ["keep", "these"] });
  });
});

describe("normalizeQuizDraft - index clamping", () => {
  it("clamps a negative index to zero", () => {
    expect(normalizeQuizDraft({ answers: {}, index: -5 }).index).toBe(0);
  });

  it("clamps an index past the end of the quiz", () => {
    expect(normalizeQuizDraft({ answers: {}, index: 999 }).index).toBe(
      QUIZ.length - 1,
    );
  });

  it("floors a fractional index", () => {
    expect(normalizeQuizDraft({ answers: {}, index: 2.9 }).index).toBe(2);
  });

  it.each([["NaN", NaN], ["a string", "3"], ["missing", undefined]])(
    "falls back to zero for %s",
    (_label, index) => {
      expect(normalizeQuizDraft({ answers: {}, index }).index).toBe(0);
    },
  );
});

describe("quizDraftKey", () => {
  // A shared laptop: without the suffix, whoever signs in next is seeded with
  // the previous member's answers and submits them as their own taste profile.
  it("scopes the draft to the member", () => {
    expect(quizDraftKey("user-a")).not.toBe(quizDraftKey("user-b"));
  });

  it("keeps a stable, namespaced shape", () => {
    expect(quizDraftKey("user-a")).toBe("om.setup.quiz.v1.user-a");
  });
});

describe("quizDraftSnapshot - cache ownership", () => {
  // The per-member storage key is worthless if the in-memory cache ignores it.
  // Signing out and back in as someone else is a client-side navigation on the
  // email-code path, so this module's state survives it.
  it("does not hand one member's draft to the next", () => {
    const a = quizDraftSnapshot("user-a");
    writeQuizDraft("user-a", { answers: { hours: "after-dark" }, index: 3 });
    expect(quizDraftSnapshot("user-a").answers).toEqual({
      hours: "after-dark",
    });

    // User B, same tab, same module instance.
    expect(quizDraftSnapshot("user-b")).toEqual({ answers: {}, index: 0 });
    expect(quizDraftSnapshot("user-b")).not.toBe(a);
  });

  it("returns a stable reference for the same member", () => {
    // useSyncExternalStore re-renders whenever the snapshot changes identity,
    // so a fresh object per call would loop forever.
    writeQuizDraft("user-c", { answers: { hours: "morning" }, index: 1 });
    expect(quizDraftSnapshot("user-c")).toBe(quizDraftSnapshot("user-c"));
  });
});
