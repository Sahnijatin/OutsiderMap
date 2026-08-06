"use client";

/**
 * The "finish your profile" card's snooze.
 *
 * A snooze, not a dismissal: the card is offering something the member will
 * probably want (a face on their posts, a map centred where they live), so
 * "not now" should mean not now rather than never. Thirty days is long enough
 * that it never nags and short enough that it eventually gets asked again.
 *
 * localStorage rather than a column - this is a UI preference, not member
 * data, and a column would cost a migration, an RLS surface and a round trip
 * for something nobody needs synced. The per-device weakness is harmless here:
 * the worst case is the card appearing once on a second device, which is what
 * it does after thirty days anyway.
 *
 * Corrupt or unreadable values read as NOT snoozed. Failing open toward
 * showing the card is the safe direction: the alternative is silently
 * swallowing it forever.
 */

const STORAGE_KEY = "om.finish-profile.v1";

export const NUDGE_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** Pure, so the clock can be injected and the rules tested in node. */
export function isNudgeSnoozed(raw: string | null, now: number): boolean {
  if (!raw) return false;
  const until = Number(raw);
  if (!Number.isFinite(until) || until <= 0) return false;
  return until > now;
}

export function snoozeValue(now: number): string {
  return String(now + NUDGE_SNOOZE_MS);
}

export function readNudgeSnoozed(now: number = Date.now()): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return isNudgeSnoozed(localStorage.getItem(STORAGE_KEY), now);
  } catch {
    return false;
  }
}

/**
 * Exposed as an external store rather than read into state inside an effect:
 * that pattern cascades renders (and the lint rule rejects it), and this is
 * genuinely external state. Same shape as the sound preferences.
 */
const listeners = new Set<() => void>();
let cached: boolean | null = null;

export function subscribeNudge(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Client snapshot. Cached so repeat renders don't re-read localStorage. */
export function nudgeSnapshot(): boolean {
  if (cached === null) cached = readNudgeSnoozed();
  return cached;
}

/**
 * Server snapshot: never snoozed. The card is hidden on the server anyway when
 * nothing is missing, so the worst case is one frame of a card that then
 * retires itself - the opposite mistake (hiding it forever) is the costly one.
 */
export function nudgeServerSnapshot(): boolean {
  return false;
}

export function snoozeNudge(now: number = Date.now()): void {
  cached = true;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, snoozeValue(now));
    }
  } catch {
    // Private mode or quota - the card just reappears next visit.
  }
  for (const listener of [...listeners]) listener();
}
