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
  const FILLED = {
    username: "adi",
    onboarding_completed_at: "2025-01-01T00:00:00Z",
    home_area: "Saket",
    display_name: "Adi",
    avatar_url: "https://x/a.jpg",
  };

  it("runs the first screen whose data is missing", () => {
    expect(
      stepId(
        profile({ ...FILLED, home_area: null, setup_steps: ["username"] }),
        { fill: true },
      ),
    ).toBe("city");
  });

  it("returns to the profile once nothing is missing", () => {
    expect(
      resolveSetupStep(
        profile({
          ...FILLED,
          setup_steps: ["username", "city", "identity", "location", "quiz"],
        }),
        { fill: true },
      ),
    ).toEqual({ kind: "done", to: "/profile" });
  });

  it("never routes to the quiz", () => {
    for (const done of [
      [],
      ["city"],
      ["city", "identity"],
      ["city", "identity", "location"],
    ]) {
      expect(
        stepId(profile({ username: "adi", setup_steps: done }), { fill: true }),
      ).not.toBe("quiz");
    }
  });

  // The regression this suite exists for. Every earlier fill test kept the
  // markers and the columns in agreement, which is exactly why resolving on
  // markers looked correct: skipping a screen marks it done while writing no
  // data, and the migration marks `identity` for anyone whose OAuth provider
  // supplied a name. Resolving on markers sent those members straight back to
  // /profile with the card still up - and these screens are the only avatar
  // and area editor in the app, so the gap became unfillable.
  describe("when the markers and the columns disagree", () => {
    it("offers identity to a member marked done but holding no avatar", () => {
      expect(
        stepId(
          profile({
            ...FILLED,
            avatar_url: null,
            setup_steps: ["username", "quiz", "identity"],
          }),
          { fill: true },
        ),
      ).toBe("identity");
    });

    it("offers city to a member who skipped it", () => {
      expect(
        stepId(
          profile({
            ...FILLED,
            home_area: null,
            setup_steps: ["username", "quiz", "city", "identity"],
          }),
          { fill: true },
        ),
      ).toBe("city");
    });

    it("agrees with the card on every combination", () => {
      // Whatever the card offers to fix, fill must be able to reach - and when
      // the card shows nothing, fill must not strand the member on a screen.
      for (const home_area of ["Saket", null]) {
        for (const avatar_url of ["https://x/a.jpg", null]) {
          for (const display_name of ["Adi", null]) {
            const p = profile({
              ...FILLED,
              home_area,
              avatar_url,
              display_name,
              // Every marker set: the worst case for a marker-driven resolver.
              setup_steps: ["username", "city", "identity", "location", "quiz"],
            });
            const gaps = missingProfileBits(p);
            const resolved = resolveSetupStep(p, { fill: true });
            if (gaps.length === 0) {
              expect(resolved).toEqual({ kind: "done", to: "/profile" });
            } else {
              expect(resolved.kind).toBe("step");
              expect(gaps).toContain(
                resolved.kind === "step" ? resolved.step.id : null,
              );
            }
          }
        }
      }
    });

    it("never offers location, which the card can never report", () => {
      expect(
        stepId(profile({ ...FILLED, setup_steps: [] }), { fill: true }),
      ).not.toBe("location");
    });
  });
});

describe("when the database cannot record progress yet", () => {
  // The app deployed ahead of migration 57: the column does not exist, so
  // select("*") never returns the property and mark_setup_step is missing too.
  // Nothing can complete the new screens - saving marks nothing and skipping
  // calls the same absent function - and the identity screen has no column to
  // fall back on, because handle_new_user prefills both of its columns from the
  // OAuth provider. Standing aside is the only outcome that isn't a trap.
  const preMigration = { username: "adi", setup_steps: undefined };

  it("sends a half-onboarded member to the quiz, not into the new screens", () => {
    expect(stepId(profile(preMigration))).toBe("quiz");
  });

  it("still sends an onboarded member to the map", () => {
    expect(
      resolveSetupStep(
        profile({
          ...preMigration,
          onboarding_completed_at: "2025-01-01T00:00:00Z",
        }),
      ),
    ).toEqual({ kind: "done", to: "/map" });
  });

  it("still demands a username first", () => {
    expect(stepId(profile({ setup_steps: undefined }))).toBe("username");
  });

  it("still honours ?redo=1", () => {
    expect(stepId(profile(preMigration), { redo: true })).toBe("quiz");
  });

  it("offers the profile card nothing, so its CTA cannot lead into a dead end", () => {
    expect(missingProfileBits(profile(preMigration))).toEqual([]);
  });

  // undefined, null and [] mean three different things and must not be
  // conflated: absent column, cleared value, and "recorded nothing yet".
  it("does NOT confuse an absent column with an empty one", () => {
    expect(stepId(profile({ username: "adi", setup_steps: [] }))).toBe("city");
    expect(stepId(profile({ username: "adi", setup_steps: null }))).toBe("city");
    expect(stepId(profile({ username: "adi", setup_steps: undefined }))).toBe(
      "quiz",
    );
  });
});

describe("a marker write that failed", () => {
  // If the app ships ahead of migration 57 the RPC does not exist, so nothing
  // gets marked - and skipping calls the same RPC. The column fallbacks are
  // what stop that pinning someone on a screen with no exit.
  it("does not re-ask for a home area that is already saved", () => {
    expect(
      stepId(profile({ username: "adi", home_area: "Saket", setup_steps: [] })),
    ).toBe("identity");
  });

  it("does not re-ask for a username that is already claimed", () => {
    expect(stepId(profile({ username: "adi", setup_steps: [] }))).toBe("city");
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
