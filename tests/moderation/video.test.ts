import { describe, expect, it } from "vitest";
import { planFrameSamples } from "@/lib/moderation/video";
import { canAdvanceCsam, nextCsamStatus } from "@/lib/moderation/csam-state";

describe("planFrameSamples", () => {
  it("samples from 0 every N seconds up to the cap", () => {
    expect(planFrameSamples(10, { everySeconds: 3, maxFrames: 8 })).toEqual([
      0, 3, 6, 9, 9.9,
    ]);
  });

  it("caps the number of frames on a long clip", () => {
    const s = planFrameSamples(600, { everySeconds: 3, maxFrames: 8 });
    expect(s.length).toBe(8);
    expect(s[0]).toBe(0);
  });

  it("returns a single frame for a zero/invalid duration", () => {
    expect(planFrameSamples(0)).toEqual([0]);
    expect(planFrameSamples(NaN)).toEqual([0]);
  });
});

describe("csam state machine", () => {
  it("only advances forward", () => {
    expect(canAdvanceCsam("detected", "preserved")).toBe(true);
    expect(canAdvanceCsam("preserved", "detected")).toBe(false);
    expect(canAdvanceCsam("reported", "reported")).toBe(true);
  });

  it("steps detected → preserved → reported → closed and stays closed", () => {
    expect(nextCsamStatus("detected")).toBe("preserved");
    expect(nextCsamStatus("preserved")).toBe("reported");
    expect(nextCsamStatus("reported")).toBe("closed");
    expect(nextCsamStatus("closed")).toBe("closed");
  });
});
