import { describe, expect, it } from "vitest";
import {
  PROFILE_STEPS,
  SETUP_STEPS,
  TOTAL_SETUP_SCREENS,
  setupStep,
  setupStepIndex,
} from "@/lib/setup/steps";
import { assertHouseVoice } from "./voice";

/**
 * The setup flow's shape and the copy contract for its pro tips. The same
 * voice assertions run over the quiz's tips in tests/taste/quiz-tips.test.ts,
 * so the two homes for tip copy cannot drift into different registers.
 */

describe("SETUP_STEPS", () => {
  it("is the flow, in order", () => {
    expect(SETUP_STEPS.map((s) => s.id)).toEqual([
      "username",
      "city",
      "identity",
      "location",
      "quiz",
    ]);
  });

  it("has unique ids", () => {
    const ids = SETUP_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every screen a title", () => {
    for (const step of SETUP_STEPS) {
      expect(step.title.trim().length, step.id).toBeGreaterThan(0);
    }
  });

  it("keeps eyebrows lowercase - .voice uppercases them in CSS", () => {
    for (const step of SETUP_STEPS) {
      expect(step.eyebrow, step.id).toBe(step.eyebrow.toLowerCase());
    }
  });

  it("ends with the quiz, so completeSetup can keep redirecting to /welcome", () => {
    expect(SETUP_STEPS.at(-1)?.id).toBe("quiz");
  });
});

describe("pro tips", () => {
  it("every screen has one", () => {
    for (const step of SETUP_STEPS) {
      expect(step.tip.trim().length, step.id).toBeGreaterThan(0);
    }
  });

  it("every tip is in the house voice", () => {
    for (const step of SETUP_STEPS) {
      assertHouseVoice(step.tip, step.id);
    }
  });
});

describe("PROFILE_STEPS", () => {
  it("covers only the screens ?fill=1 can re-run", () => {
    expect(PROFILE_STEPS).toEqual(["city", "identity", "location"]);
  });

  it("excludes the one-shot username and the quiz", () => {
    expect(PROFILE_STEPS).not.toContain("username");
    expect(PROFILE_STEPS).not.toContain("quiz");
  });

  it("only names real steps", () => {
    const ids = new Set(SETUP_STEPS.map((s) => s.id));
    for (const id of PROFILE_STEPS) expect(ids.has(id)).toBe(true);
  });
});

describe("lookup helpers", () => {
  it("finds a step by id", () => {
    expect(setupStep("city").id).toBe("city");
  });

  it("throws rather than returning undefined for an unknown id", () => {
    // @ts-expect-error - deliberately outside SetupStepId
    expect(() => setupStep("banana")).toThrow(/unknown setup step/);
  });

  it("indexes steps in flow order", () => {
    expect(setupStepIndex("username")).toBe(0);
    expect(setupStepIndex("quiz")).toBe(SETUP_STEPS.length - 1);
  });
});

describe("TOTAL_SETUP_SCREENS", () => {
  it("is at least as many as there are steps", () => {
    expect(TOTAL_SETUP_SCREENS).toBeGreaterThanOrEqual(SETUP_STEPS.length);
  });
});
