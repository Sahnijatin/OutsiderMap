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

export type StrikeAction = "warn" | "mute" | "ban";

export type ResolvedEnforcement = {
  strikeCount: number;
  action: StrikeAction;
  muteHours: number;
};

/**
 * Combine a fresh strike with the reviewer's chosen action into the effective
 * enforcement. The result is the *more severe* of the ladder outcome (keyed by
 * the new strike count) and the reviewer's explicit pick - so the ladder drives
 * escalation automatically (repeat offenders get 7d, then a ban), while a
 * reviewer can still escalate past the ladder floor for an egregious first
 * strike. Mute duration always comes from the ladder.
 */
export function resolveEnforcement(
  prevStrikes: number,
  chosen: StrikeAction,
): ResolvedEnforcement {
  const strikeCount = prevStrikes + 1;
  const ladder = enforcementForStrike(strikeCount);
  const rank: Record<StrikeAction, number> = { warn: 0, mute: 1, ban: 2 };
  const action = rank[chosen] >= rank[ladder.action] ? chosen : ladder.action;
  const muteHours =
    action === "mute" ? (ladder.action === "mute" ? ladder.muteHours : 24) : 0;
  return { strikeCount, action, muteHours };
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
