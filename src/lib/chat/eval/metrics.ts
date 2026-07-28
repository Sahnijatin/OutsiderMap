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

/** Mean Jaccard overlap over every unordered pair. Assumes 2+ non-empty sets. */
function meanPairwiseJaccard(sets: readonly Set<string>[]): number {
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const a = sets[i];
      const b = sets[j];
      let intersection = 0;
      for (const item of a) if (b.has(item)) intersection += 1;
      total += intersection / (a.size + b.size - intersection);
      pairs += 1;
    }
  }
  return total / pairs;
}

/** Shared shape for the two overlap metrics, so they cannot drift apart. */
function overlapOf(
  groups: readonly { id: string; items: readonly string[] }[],
): OverlapResult {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  const skippedEmpty = groups.length - nonEmpty.length;

  if (nonEmpty.length < 2) {
    return { overlap: null, comparedPersonas: nonEmpty.length, skippedEmpty };
  }

  return {
    overlap: meanPairwiseJaccard(nonEmpty.map((g) => new Set(g.items))),
    comparedPersonas: nonEmpty.length,
    skippedEmpty,
  };
}

export function pickOverlap(runs: readonly PersonaRun[]): OverlapResult {
  return overlapOf(runs.map((r) => ({ id: r.personaId, items: r.slugs })));
}

// ---------------------------------------------------------------------------
// Prompt divergence - the half of the eval that needs no model
// ---------------------------------------------------------------------------

/**
 * Structural words the member profile block always contains.
 *
 * They are constant by construction, so leaving them in would add a fixed
 * overlap floor that has nothing to do with how different two members are.
 * Dropping them makes the number mean what it says: how much *taste
 * vocabulary* two prompts share.
 */
const BLOCK_BOILERPLATE = new Set([
  "member_profile",
  "rewards",
  "avoids",
  "actually",
  "goes",
  "budget",
  "band",
  "company",
  "food",
  "says",
  "hold",
  "recently",
  "saved",
  "passed",
  "stretch",
  "only",
  "logged",
  "action",
  "actions",
  "behaviour",
  "read",
  "thin",
  "lean",
  "with",
  "them",
  "they",
  "their",
  "that",
  "this",
  "from",
  "have",
  "into",
  "than",
  "will",
  "your",
  "there",
  "about",
  "which",
  "where",
  "when",
]);

/** The member profile block inside a rendered system prompt, if it has one. */
export function profileBlockOf(prompt: string): string | null {
  const match = prompt.match(/<member_profile>([\s\S]*?)<\/member_profile>/);
  return match ? match[1].trim() : null;
}

function contentTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}-]+/u)
        .filter((w) => w.length >= 4 && !BLOCK_BOILERPLATE.has(w)),
    ),
  ];
}

/**
 * How much taste vocabulary two members' prompts share.
 *
 * Scoped to the member profile block rather than the whole prompt: every prompt
 * carries the same ~8000 characters of routing, guardrails and voice rules, so
 * whole-prompt overlap would sit near 1.0 for any two members and measure
 * nothing.
 *
 * This is the half of the personalization eval that needs no model, no database
 * and no keys - it measures the *input* to the model, which is exactly what
 * putting the persona in the prompt changed. It cannot tell you whether the
 * answers differ; if this is low and pick overlap later comes back high, that
 * isolates the failure to ranking and retrieval rather than context.
 */
export function promptOverlap(
  prompts: readonly { personaId: string; prompt: string }[],
): OverlapResult {
  return overlapOf(
    prompts.map((p) => ({
      id: p.personaId,
      items: contentTokens(profileBlockOf(p.prompt) ?? ""),
    })),
  );
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
