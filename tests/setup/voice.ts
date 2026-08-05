import { expect } from "vitest";

/**
 * The house voice rules a pro tip must obey, in one place.
 *
 * Tip copy lives in two files - SETUP_STEPS for the static screens and QUIZ
 * for the eight questions - because each already owns its screen's copy.
 * Sharing the assertions is what stops those two homes drifting into
 * different registers.
 *
 * Rules are from BRAND_BOOK.md §2 and §8, plus the punctuation conventions the
 * shipped copy already follows.
 */

/** Explicitly banned by BRAND_BOOK §8: never present a menu, never hedge. */
const BANNED = [
  "you could try",
  "you might want",
  "maybe try",
  "feel free to",
  "please note",
];

/** Shipped copy uses an ASCII hyphen as the dash, never an em or en dash. */
const TYPOGRAPHIC_DASH = /[—–]/;

/** Emoji have never appeared in this product's copy. */
const EMOJI = /\p{Extended_Pictographic}/u;

/** Long enough to teach something, short enough to read before tapping. */
const MAX_LENGTH = 200;

export function assertHouseVoice(tip: string, label: string) {
  expect(tip.trim(), label).toBe(tip);
  expect(tip.length, `${label}: tip is too long to read on a phone`)
    .toBeLessThanOrEqual(MAX_LENGTH);
  expect(tip.endsWith("."), `${label}: tips end in a full stop`).toBe(true);
  expect(TYPOGRAPHIC_DASH.test(tip), `${label}: use an ASCII hyphen`).toBe(
    false,
  );
  expect(EMOJI.test(tip), `${label}: no emoji`).toBe(false);
  for (const phrase of BANNED) {
    expect(
      tip.toLowerCase().includes(phrase),
      `${label}: "${phrase}" hedges - give the answer`,
    ).toBe(false);
  }
}
