import type { TrustTier } from "./model";

/**
 * Pure trust + enforcement logic. Tier governs the pre-vs-post publishing
 * posture; the strike ladder escalates warn → mute → ban.
 */

/** Derive a trust tier from account age + strike history. */
export function deriveTier(input: {
  accountAgeDays: number;
  strikeCount: number;
}): TrustTier {
  if (input.strikeCount >= 3) return "restricted";
  if (input.accountAgeDays >= 30 && input.strikeCount === 0) return "trusted";
  if (input.accountAgeDays >= 3) return "member";
  return "new";
}

export type Enforcement =
  | { action: "warn" }
  | { action: "mute"; muteHours: number }
  | { action: "ban" };

/**
 * The enforcement ladder, keyed by the strike count *after* the new strike.
 * 1 → warn, 2 → 24h mute, 3 → 7d mute, 4+ → ban.
 */
export function enforcementForStrike(strikeCount: number): Enforcement {
  if (strikeCount <= 1) return { action: "warn" };
  if (strikeCount === 2) return { action: "mute", muteHours: 24 };
  if (strikeCount === 3) return { action: "mute", muteHours: 24 * 7 };
  return { action: "ban" };
}

export type Posture = "pre_screen" | "optimistic" | "hold";

/**
 * The publishing posture for a piece of content. All media is always
 * pre-screened before it can go public; established members' text publishes
 * optimistically (screened async, pulled if flagged); new/restricted users'
 * text is held until the automated pass clears.
 */
export function screeningPosture(tier: TrustTier, hasMedia: boolean): Posture {
  if (hasMedia) return "pre_screen";
  if (tier === "trusted" || tier === "member") return "optimistic";
  return "hold";
}
