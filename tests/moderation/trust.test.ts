import { describe, expect, it } from "vitest";
import {
  deriveTier,
  enforcementForStrike,
  resolveEnforcement,
  screeningPosture,
} from "@/lib/moderation/trust";

describe("deriveTier", () => {
  it("starts new, becomes member after a few days, trusted after a month clean", () => {
    expect(deriveTier({ accountAgeDays: 0, strikeCount: 0 })).toBe("new");
    expect(deriveTier({ accountAgeDays: 5, strikeCount: 0 })).toBe("member");
    expect(deriveTier({ accountAgeDays: 40, strikeCount: 0 })).toBe("trusted");
  });

  it("keeps a struck older account out of trusted, and restricts repeat offenders", () => {
    expect(deriveTier({ accountAgeDays: 40, strikeCount: 1 })).toBe("member");
    expect(deriveTier({ accountAgeDays: 400, strikeCount: 3 })).toBe("restricted");
  });
});

describe("enforcementForStrike", () => {
  it("escalates warn → mute → longer mute → ban", () => {
    expect(enforcementForStrike(1)).toEqual({ action: "warn" });
    expect(enforcementForStrike(2)).toEqual({ action: "mute", muteHours: 24 });
    expect(enforcementForStrike(3)).toEqual({ action: "mute", muteHours: 168 });
    expect(enforcementForStrike(4)).toEqual({ action: "ban" });
  });
});

describe("resolveEnforcement", () => {
  it("follows the ladder when the reviewer picks the ladder's action", () => {
    // prevStrikes 0 → strike 1 → warn
    expect(resolveEnforcement(0, "warn")).toEqual({
      strikeCount: 1,
      action: "warn",
      muteHours: 0,
    });
    // prevStrikes 1 → strike 2 → 24h mute
    expect(resolveEnforcement(1, "mute")).toEqual({
      strikeCount: 2,
      action: "mute",
      muteHours: 24,
    });
    // prevStrikes 3 → strike 4 → ban
    expect(resolveEnforcement(3, "ban")).toEqual({
      strikeCount: 4,
      action: "ban",
      muteHours: 0,
    });
  });

  it("escalates a soft pick up to the ladder floor (repeat offender)", () => {
    // reviewer clicks 'mute' on a 3rd strike → ladder says 7d, not 24h
    expect(resolveEnforcement(2, "mute")).toEqual({
      strikeCount: 3,
      action: "mute",
      muteHours: 168,
    });
    // reviewer clicks 'warn' on a 2nd strike → ladder floor is a 24h mute
    expect(resolveEnforcement(1, "warn")).toEqual({
      strikeCount: 2,
      action: "mute",
      muteHours: 24,
    });
  });

  it("lets the reviewer escalate past the ladder floor for an egregious strike", () => {
    // ban on a first strike: ladder floor is 'warn', reviewer's ban wins
    expect(resolveEnforcement(0, "ban")).toEqual({
      strikeCount: 1,
      action: "ban",
      muteHours: 0,
    });
  });
});

describe("screeningPosture", () => {
  it("always pre-screens media", () => {
    expect(screeningPosture("trusted", true)).toBe("pre_screen");
    expect(screeningPosture("new", true)).toBe("pre_screen");
  });

  it("is optimistic for established members' text, holds new/restricted", () => {
    expect(screeningPosture("trusted", false)).toBe("optimistic");
    expect(screeningPosture("member", false)).toBe("optimistic");
    expect(screeningPosture("new", false)).toBe("hold");
    expect(screeningPosture("restricted", false)).toBe("hold");
  });
});
