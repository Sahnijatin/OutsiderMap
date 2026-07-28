import { BANNED_PHRASES, RECITATION_PATTERNS } from "@/lib/chat/voice";

/**
 * Scoring functions for the personalization eval (plan step 1).
 *
 * Deliberately pure and dependency-free - no Supabase, no model, no
 * `server-only` - so the whole file unit-tests in CI without a key or a
 * database. The live harness (`./harness.ts`) supplies the data; this module
 * only does arithmetic and string matching on it.
 *
 * The question every function here exists to answer: do two members with
 * opposite taste actually get different answers, and can the concierge say why
 * without reciting their profile at them?
 */

/**
 * Normalized for comparison: lowercased, hyphens/underscores/slashes flattened
 * to spaces, punctuation dropped, and padded so `includes(" needle ")` behaves
 * as a word-boundary match. Vibe tags arrive hyphenated (`hole-in-the-wall`)
 * while a reply writes them as prose ("hole in the wall"), so both sides get
 * the same treatment.
 */
function normalize(text: string): string {
  const flat = text
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${flat} `;
}

// ---------------------------------------------------------------------------
// Pick overlap - the headline number
// ---------------------------------------------------------------------------

export interface PersonaRun {
  personaId: string;
  /** Catalog slugs this persona was shown, in order. */
  slugs: readonly string[];
}

export interface OverlapResult {
  /**
   * Mean pairwise Jaccard overlap across personas for one ask.
   * 0 = every persona got a disjoint set, 1 = they all got the same places.
   * **Lower is better.** null when fewer than two personas produced picks.
   */
  overlap: number | null;
  /** Personas that produced at least one pick and were therefore compared. */
  comparedPersonas: number;
  /**
   * Personas that produced no picks at all. Reported rather than folded in:
   * an empty set looks maximally divergent against every other set, so
   * counting failed turns as personalization would let the metric flatter
   * itself exactly when the product is broken.
   */
  skippedEmpty: number;
}

export function pickOverlap(runs: readonly PersonaRun[]): OverlapResult {
  const nonEmpty = runs.filter((r) => r.slugs.length > 0);
  const skippedEmpty = runs.length - nonEmpty.length;

  if (nonEmpty.length < 2) {
    return { overlap: null, comparedPersonas: nonEmpty.length, skippedEmpty };
  }

  const sets = nonEmpty.map((r) => new Set(r.slugs));
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const a = sets[i];
      const b = sets[j];
      let intersection = 0;
      for (const slug of a) if (b.has(slug)) intersection += 1;
      total += intersection / (a.size + b.size - intersection);
      pairs += 1;
    }
  }

  return {
    overlap: total / pairs,
    comparedPersonas: nonEmpty.length,
    skippedEmpty,
  };
}

// ---------------------------------------------------------------------------
// Reason specificity
// ---------------------------------------------------------------------------

/**
 * Which of this persona's own tokens (top vibes, areas, cuisines, anchor
 * keywords) the reason actually names.
 *
 * Crude on purpose, and it under-reports: a genuinely personal reason can name
 * a dish or an hour that earns the pick without reusing a profile word. That is
 * why the plan reports this as a percentage before it is ever gated - if the
 * false-negative rate is high, the fix is a model-judged pass on the failures,
 * not a looser threshold.
 */
export function matchedTokens(
  reason: string,
  tokens: readonly string[],
): string[] {
  const haystack = normalize(reason);
  const hits: string[] = [];
  for (const token of tokens) {
    const needle = normalize(token).trim();
    if (needle.length < 3) continue;
    // Light plural tolerance: "parathas" in the profile, "paratha" in the reply.
    const singular = needle.endsWith("s") ? needle.slice(0, -1) : null;
    if (
      haystack.includes(` ${needle} `) ||
      (singular && singular.length >= 3 && haystack.includes(` ${singular} `))
    ) {
      hits.push(token);
    }
  }
  return hits;
}

export function reasonSpecificity(
  reason: string,
  tokens: readonly string[],
): boolean {
  return matchedTokens(reason, tokens).length > 0;
}

// ---------------------------------------------------------------------------
// Model-written reason share
// ---------------------------------------------------------------------------

/**
 * Fraction of picks whose reason the model actually wrote for this person.
 *
 * The complement is the static editor note - the same sentence every member
 * sees, which the UI already labels "From our notes:". This is the most direct
 * "did we serve generic copy" signal in the product and it needs no new
 * instrumentation; `engine.ts` has been stamping `reasonSource` all along.
 *
 * Missing `reasonSource` counts as an editor note, matching the field's own
 * contract for rows persisted before it existed.
 */
export function modelReasonShare(
  picks: readonly { reasonSource?: "model" | "editor_note" }[],
): number | null {
  if (picks.length === 0) return null;
  const model = picks.filter((p) => p.reasonSource === "model").length;
  return model / picks.length;
}

// ---------------------------------------------------------------------------
// Voice checks
// ---------------------------------------------------------------------------

/** Banned house-voice phrases present in a reply. Empty means clean. */
export function bannedPhrasesIn(text: string): string[] {
  const haystack = normalize(text);
  const hits: string[] = [];
  for (const banned of BANNED_PHRASES) {
    if (banned.detect) {
      if (banned.detect.test(text)) hits.push(banned.phrase);
      continue;
    }
    if (haystack.includes(normalize(banned.phrase))) hits.push(banned.phrase);
  }
  return hits;
}

/**
 * Ways this reply narrates the member's profile back at them. Empty means
 * clean.
 *
 * Unlike markdown or em dashes, this cannot be stripped at runtime - removing
 * the clause breaks the sentence - so it is a metric and a CI gate, never a
 * `sanitizeReply` rule.
 */
export function recitesProfile(text: string): string[] {
  return RECITATION_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
}

/**
 * Fraction of replies that recite the profile.
 *
 * Gated as a rate, not zero: an occasional acknowledgement is the product
 * working ("you've been on a late-night streak, so..."). The failure is when it
 * is every turn and always a preamble.
 */
export function recitationRate(texts: readonly string[]): number | null {
  if (texts.length === 0) return null;
  return texts.filter((t) => recitesProfile(t).length > 0).length / texts.length;
}
