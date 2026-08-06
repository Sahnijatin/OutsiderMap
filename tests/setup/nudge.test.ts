import { describe, expect, it } from "vitest";
import {
  isNudgeSnoozed,
  NUDGE_SNOOZE_MS,
  snoozeValue,
} from "@/lib/setup/nudge";

/**
 * The "finish your profile" snooze. The clock is injected so the thirty-day
 * boundary can actually be tested rather than assumed.
 */

const NOW = 1_760_000_000_000;

describe("isNudgeSnoozed", () => {
  it("is false for a member who has never dismissed it", () => {
    expect(isNudgeSnoozed(null, NOW)).toBe(false);
  });

  it("is true immediately after a snooze", () => {
    expect(isNudgeSnoozed(snoozeValue(NOW), NOW)).toBe(true);
  });

  it("is still true one day before expiry", () => {
    const oneDay = 24 * 60 * 60 * 1000;
    expect(
      isNudgeSnoozed(snoozeValue(NOW), NOW + NUDGE_SNOOZE_MS - oneDay),
    ).toBe(true);
  });

  it("expires after thirty days", () => {
    expect(isNudgeSnoozed(snoozeValue(NOW), NOW + NUDGE_SNOOZE_MS + 1)).toBe(
      false,
    );
  });

  // Fail open: a value we cannot read must show the card, never silently
  // swallow it forever.
  it.each([
    ["an empty string", ""],
    ["junk", "soon"],
    ["a negative timestamp", "-1"],
    ["zero", "0"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
  ])("treats %s as not snoozed", (_label, raw) => {
    expect(isNudgeSnoozed(raw, NOW)).toBe(false);
  });
});

describe("NUDGE_SNOOZE_MS", () => {
  it("is thirty days", () => {
    expect(NUDGE_SNOOZE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
