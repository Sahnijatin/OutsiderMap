import type { Posture } from "@/lib/chat/adventurousness";

/**
 * The four suggestion chips on an empty chat.
 *
 * They are the first thing a member sees on the surface that is supposed to
 * prove the product knows them, and until now they were four hardcoded strings
 * - identical for everyone, at the exact moment identical is most expensive.
 *
 * These are generated instead, from the member's own vocabulary and the actual
 * hour. Deterministic and free: no model call, no randomness (a chip that
 * changes between server render and hydration is a bug, and one that changes on
 * every visit is unsettling), and a member with nothing on file still gets the
 * four good generic ones.
 *
 * ## Why the input type is this narrow
 *
 * The obvious implementation takes a `Persona` and has everything. It would
 * also have `anchors` ("repairs bad days with chai, not company") and remembered
 * facts ("vegetarian, no egg") - sentences and fragments, not nouns. Dropping
 * those into a template produces "good vegetarian, no egg tonight", which is
 * worse than the generic chip it replaced and reads as broken software.
 *
 * So this function can only see closed, short vocabulary: catalog area names,
 * the quiz's cuisine nouns, place names, a posture, an hour. Everything that
 * slots cleanly into a sentence, and nothing that does not. The type is the
 * guardrail; a comment asking future callers not to pass prose would not be.
 *
 * ## Why they are written as asks
 *
 * Every chip is phrased the way the member would type it, never the way the app
 * would describe them. "the best kebab you know" is a shortcut; "since you love
 * kebab" is the product reading a file out loud. Same recitation rule as the
 * persona block, applied to the one surface where the member's own words are
 * being put in their mouth.
 */

/** Shown to a member we know nothing about, and used to top up a short list. */
export const GENERIC_OPENERS = [
  "I want something good and crispy",
  "quiet place to read for a few hours",
  "first date, not trying too hard",
  "it's late and I'm starving",
] as const;

/** Four fits the empty state without the column becoming a menu. */
const OPENER_COUNT = 4;

export interface OpenerInput {
  /** Catalog area names the member actually goes to. */
  areas: string[];
  /** Quiz cuisine leanings - short nouns like "kebab", "south indian". */
  cuisines: string[];
  /** Place names from their bucket. */
  savedRecently: string[];
  posture: Posture;
  /** Hour of day in IST, 0-23. The 3am promise only works if we know it is 3am. */
  hourIST: number;
}

/**
 * What someone is plausibly asking for at this hour.
 *
 * The most situational chip and so the first one: a concierge whose opening
 * offer at 2am is "first date, not trying too hard" has already shown it is not
 * paying attention to anything.
 */
function hourOpener(hour: number): string {
  if (hour >= 5 && hour < 11) return "breakfast somewhere good";
  if (hour >= 11 && hour < 16) return "somewhere to sit for a few hours";
  if (hour >= 16 && hour < 22) return "dinner tonight, nothing fancy";
  return "it's late and I'm starving";
}

/**
 * Up to {@link OPENER_COUNT} openers, most situational first, topped up with
 * the generic ones so the column is never short.
 */
export function chatOpeners(input: OpenerInput | null): string[] {
  if (!input) return [...GENERIC_OPENERS];

  const openers: string[] = [hourOpener(input.hourIST)];

  const cuisine = firstUsable(input.cuisines);
  if (cuisine) openers.push(`the best ${cuisine} you know`);

  // "Somewhere like X" is the single most useful thing a member can say, and
  // the hardest to think of unprompted - it turns their own bucket into a
  // query without them having to remember what is in it.
  const saved = firstUsable(input.savedRecently);
  if (saved) openers.push(`somewhere like ${saved}`);

  const area = firstUsable(input.areas);
  if (area) openers.push(`something in ${area} I haven't been to`);

  // Offered only to someone whose behaviour says they would take it. To a
  // member with one narrow taste, "surprise me" is not an invitation - it is
  // the app admitting it has no idea.
  if (input.posture === "explore") openers.push("surprise me");

  for (const generic of GENERIC_OPENERS) {
    if (openers.length >= OPENER_COUNT) break;
    if (!openers.includes(generic)) openers.push(generic);
  }

  return openers.slice(0, OPENER_COUNT);
}

/**
 * The first entry short enough to read as a noun inside a sentence.
 *
 * Catalog areas and quiz cuisines are meant to be short, but neither is
 * validated for length anywhere, and one long value would produce a chip that
 * wraps to three lines and reads as a bug.
 */
function firstUsable(values: string[]): string | null {
  const found = values
    .map((v) => v.trim())
    .find((v) => v.length > 0 && v.length <= 24);
  return found ?? null;
}
