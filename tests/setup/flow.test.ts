import { describe, expect, it } from "vitest";
import {
  missingProfileBits,
  resolveSetupStep,
  type SetupProfileShape,
} from "@/lib/setup/flow";
import { SETUP_STEPS, TOTAL_SETUP_SCREENS } from "@/lib/setup/steps";
import { QUIZ } from "@/lib/taste/quiz";

/**
 * The first-run flow's rules. /setup grew from two screens to twelve, and the
 * failure this suite exists to prevent is the expensive one: an existing
 * member being thrown back into onboarding by a step set that doesn't know
 * about them.
 */

const BLANK: SetupProfileShape = {
  username: null,
  onboarding_completed_at: null,
  setup_steps: [],
  display_name: null,
  avatar_url: null,
  home_area: null,
};

function profile(over: Partial<SetupProfileShape> = {}): SetupProfileShape {
  return { ...BLANK, ...over };
}

function stepId(p: SetupProfileShape, opts = {}) {
  const r = resolveSetupStep(p, opts);
  return r.kind === "step" ? r.step.id : null;
}

describe("resolveSetupStep - the happy path, screen by screen", () => {
  it("starts at the username", () => {
    expect(stepId(profile())).toBe("username");
  });

  it("walks city -> identity -> location -> quiz as steps complete", () => {
    const walk = ["city", "identity", "location", "quiz"] as const;
    let done: string[] = ["username"];
    for (const expected of walk) {
      expect(stepId(profile({ username: "adi", setup_steps: done }))).toBe(
        expected,
      );
      done = [...done, expected];
    }
  });

  it("reports the screen index the progress bar needs", () => {
    const r = resolveSetupStep(profile({ username: "adi", setup_steps: ["username"] }));
    expect(r).toMatchObject({ kind: "step", index: 1 });
  });
});

describe("resolveSetupStep - existing members are never re-onboarded", () => {
  // The regression guard. Every member who signed up before this flow existed
  // has onboarding_completed_at set; the migration backfills setup_steps, but
  // this must hold even when it hasn't run or has been wiped.
  it("sends an onboarded member to the map even with an empty step set", () => {
    expect(
      resolveSetupStep(
        profile({
          username: "adi",
          onboarding_completed_at: "2025-01-01T00:00:00Z",
          setup_steps: [],
        }),
      ),
    ).toEqual({ kind: "done", to: "/map" });
  });

  it("sends an onboarded member to the map even with a null step set", () => {
    expect(
      resolveSetupStep(
        profile({
          username: "adi",
          onboarding_completed_at: "2025-01-01T00:00:00Z",
          setup_steps: null,
        }),
      ),
    ).toEqual({ kind: "done", to: "/map" });
  });

  it("still demands a username first if somehow absent", () => {
    expect(
      stepId(profile({ onboarding_completed_at: "2025-01-01T00:00:00Z" })),
    ).toBe("username");
  });
});

describe("resolveSetupStep - ?redo=1", () => {
  // Pins "Retake the quiz" on the profile page and retryTasteRead's recovery
  // redirect, both of which target an already-onboarded member.
  it("goes to the quiz for an onboarded member", () => {
    expect(
      stepId(
        profile({
          username: "adi",
          onboarding_completed_at: "2025-01-01T00:00:00Z",
          setup_steps: ["username", "city", "identity", "location", "quiz"],
        }),
        { redo: true },
      ),
    ).toBe("quiz");
  });

  it("goes to the quiz even with an empty step set", () => {
    expect(stepId(profile(), { redo: true })).toBe("quiz");
  });

  it("beats fill when both are set", () => {
    expect(stepId(profile({ username: "adi" }), { redo: true, fill: true })).toBe(
      "quiz",
    );
  });
});

describe("resolveSetupStep - ?fill=1", () => {
  it("runs the first missing profile screen", () => {
    expect(
      stepId(profile({ username: "adi", setup_steps: ["username", "city"] }), {
        fill: true,
      }),
    ).toBe("identity");
  });

  it("returns to the profile once nothing is missing", () => {
    expect(
      resolveSetupStep(
        profile({
          username: "adi",
          onboarding_completed_at: "2025-01-01T00:00:00Z",
          setup_steps: ["username", "city", "identity", "location", "quiz"],
        }),
        { fill: true },
      ),
    ).toEqual({ kind: "done", to: "/profile" });
  });

  it("never routes to the quiz", () => {
    for (const done of [[], ["city"], ["city", "identity"], ["city", "identity", "location"]]) {
      expect(
        stepId(profile({ username: "adi", setup_steps: done }), { fill: true }),
      ).not.toBe("quiz");
    }
  });
});

describe("resolveSetupStep - hostile input", () => {
  it("ignores unknown step ids", () => {
    expect(
      stepId(profile({ username: "adi", setup_steps: ["banana", "username"] })),
    ).toBe("city");
  });

  it("tolerates a null step set", () => {
    expect(stepId(profile({ username: "adi", setup_steps: null }))).toBe("city");
  });

  it("lands on the quiz when every step is somehow marked but onboarding is not", () => {
    expect(
      stepId(
        profile({
          username: "adi",
          setup_steps: SETUP_STEPS.map((s) => s.id),
        }),
      ),
    ).toBe("quiz");
  });
});

describe("missingProfileBits", () => {
  it("is empty for a complete profile", () => {
    expect(
      missingProfileBits(
        profile({ home_area: "Saket", display_name: "Adi", avatar_url: "u" }),
      ),
    ).toEqual([]);
  });

  it("flags a missing area", () => {
    expect(
      missingProfileBits(profile({ display_name: "Adi", avatar_url: "u" })),
    ).toEqual(["city"]);
  });

  it("flags identity when either the name or the photo is missing", () => {
    expect(
      missingProfileBits(profile({ home_area: "Saket", avatar_url: "u" })),
    ).toEqual(["identity"]);
    expect(
      missingProfileBits(profile({ home_area: "Saket", display_name: "Adi" })),
    ).toEqual(["identity"]);
  });

  it("treats a whitespace-only display name as missing", () => {
    expect(
      missingProfileBits(
        profile({ home_area: "Saket", display_name: "   ", avatar_url: "u" }),
      ),
    ).toEqual(["identity"]);
  });

  it("never asks about location - the server cannot tell when it is satisfied", () => {
    expect(missingProfileBits(profile())).not.toContain("location");
  });
});

describe("screen count", () => {
  it("counts the four static screens plus every quiz question", () => {
    expect(TOTAL_SETUP_SCREENS).toBe(SETUP_STEPS.length - 1 + QUIZ.length);
    expect(TOTAL_SETUP_SCREENS).toBe(12);
  });
});
