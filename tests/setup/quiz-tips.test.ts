import { describe, expect, it } from "vitest";
import { QUIZ, QUIZ_VERSION, answersToText } from "@/lib/taste/quiz";
import { assertHouseVoice } from "./voice";

/**
 * The first test to assert anything about QUIZ itself.
 *
 * The quiz array has always been load-bearing - the rendering component
 * indexes into it, non-null-asserts its options, and hardcodes copy that only
 * reads correctly given a particular question order - but nothing pinned any
 * of that. Adding pro tips is the moment to.
 */

describe("pro tips", () => {
  it("every question has one", () => {
    for (const q of QUIZ) {
      expect(q.tip?.trim().length, q.id).toBeGreaterThan(0);
    }
  });

  it("every tip is in the house voice", () => {
    for (const q of QUIZ) assertHouseVoice(q.tip!, q.id);
  });
});

describe("QUIZ_VERSION", () => {
  // The tip is display-only and never reaches the extraction prompt, so no
  // stored answer changed meaning. Bumping the version here would invalidate
  // every member's saved quiz_answers for a copy change.
  it("is unchanged by adding display-only copy", () => {
    expect(QUIZ_VERSION).toBe(2);
  });
});

describe("the assumptions quiz.tsx makes", () => {
  it("gives every single/multi question options - the component asserts non-null", () => {
    for (const q of QUIZ) {
      if (q.kind === "single" || q.kind === "multi") {
        expect(q.options?.length, q.id).toBeGreaterThan(0);
      }
    }
  });

  it("has unique question ids - answers are keyed by them", () => {
    const ids = QUIZ.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has at least one question", () => {
    expect(QUIZ.length).toBeGreaterThan(0);
  });

  it("keeps eyebrows lowercase - .voice uppercases them in CSS", () => {
    for (const q of QUIZ) {
      expect(q.eyebrow, q.id).toBe(q.eyebrow.toLowerCase());
    }
  });
});

describe("answersToText", () => {
  // The extraction prompt's input. Adding a field to QuizQuestion must not
  // change a single character of what the model reads, or every stored taste
  // profile was built from a different prompt than the next one will be.
  it("renders labels for choices and raw text for prose", () => {
    const text = answersToText({
      hours: "after-dark",
      areas: ["Saket", "Old Delhi"],
      "perfect-night": "parathas at 1am",
    });
    expect(text).toContain("When does your city happen?\n- After dark");
    expect(text).toContain("Saket & Mehrauli, Old Delhi");
    expect(text).toContain("- parathas at 1am");
  });

  it("marks unanswered questions as skipped", () => {
    expect(answersToText({})).toContain("(skipped)");
  });

  it("never leaks the tip copy into the prompt", () => {
    const text = answersToText({ hours: "after-dark" });
    for (const q of QUIZ) {
      if (q.tip) expect(text).not.toContain(q.tip);
    }
  });
});
