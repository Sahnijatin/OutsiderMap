import { describe, expect, it } from "vitest";
import {
  deriveTier,
  enforcementForStrike,
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
