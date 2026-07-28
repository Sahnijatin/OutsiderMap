import type { Persona } from "@/lib/chat/persona";

/**
 * Per-candidate evidence: what makes THIS place a fit for THIS member.
 *
 * The problem it solves. Until now a search result carried one number - `fit` -
 * produced by blending the member's taste vector into the query vector before
 * retrieval. That did two bad things at once. It perturbed the ask ("crispy
 * late-night" drifted toward the member's centroid, so retrieval answered a
 * question nobody asked), and it collapsed two different signals into one
 * scalar, so the model could say a place was a good match but never say why it
 * was a good match *for this person*. A reason built on a blended cosine can
 * only ever paraphrase the editorial copy, which is exactly the generic output
 * this work exists to fix.
 *
 * The fix is to separate them. Retrieval now runs on the ask alone, and the
 * personal signal arrives per candidate as named, quotable facts.
 *
 * ## Why tags rather than a taste cosine
 *
 * A vector taste-fit is possible but would need `match_places` to expose a
 * second similarity, which is a schema change. It would also be the wrong
 * shape: "taste_fit 0.62" is not something a concierge can say out loud, while
 * "hole-in-the-wall and late-night, your top two" is. The point of separating
 * the signals is to make them sayable, so tag, area and price overlap are the
 * better primitive here - not a compromise forced by the schema.
 *
 * ## What this deliberately is not
 *
 * It is not a ranking function. There is no weighted score, because inventing
 * weights with no measurement to check them against is how a ranker ends up
 * confidently wrong. The model remains the ranker - the project's own AI plan
 * says so ("pre-volume the LLM *is* the ranker") - and this gives it separated
 * evidence to rank with instead of one number that hides everything.
 */

/** The evidence attached to one candidate. Absent keys mean "nothing to say". */
export interface ForYou {
  /** This member's own top vibes that this place actually has. */
  matches?: string[];
  /** Vibes this member's behaviour avoids that this place has. */
  clashes?: string[];
  /** True when the place sits in an area they actually go to. */
  their_area?: true;
  /** Only when it lands outside their usual band - silence means "fine". */
  above_budget?: true;
  /** True when they have saved somewhere by this name before. */
  saved_before?: true;
  /**
   * A pattern in what they save: "the third study-spot you've saved". Only set
   * when the count is high enough to be a habit rather than a coincidence.
   */
  echoes_saves?: { tag: string; count: number };
  /** The same, for places they explicitly passed on. */
  echoes_passes?: { tag: string; count: number };
}

/**
 * How many past saves (or passes) a tag needs before it counts as a pattern.
 *
 * Two, not one. One shared tag between this place and one saved place is a
 * coincidence, and "you saved a study-spot once" is not worth a sentence -
 * while "the third study-spot you've saved" is the kind of specific a concierge
 * earns trust with. Getting this wrong in the loose direction produces
 * confident noise, which is worse than saying nothing.
 */
const PATTERN_MIN = 2;

/** The tag this place shares most often with a slice of the member's history. */
function strongestPattern(
  tags: readonly string[],
  counts: Record<string, number>,
): { tag: string; count: number } | undefined {
  let best: { tag: string; count: number } | undefined;
  for (const tag of tags) {
    const count = counts[tag] ?? 0;
    if (count >= PATTERN_MIN && (!best || count > best.count)) {
      best = { tag, count };
    }
  }
  return best;
}

function overlap(tags: readonly string[], against: readonly string[]): string[] {
  if (tags.length === 0 || against.length === 0) return [];
  const wanted = new Set(against.map((t) => t.toLowerCase()));
  return tags.filter((t) => wanted.has(t.toLowerCase()));
}

/**
 * Evidence for one candidate, or null when there is nothing worth the tokens.
 *
 * Returning null rather than an empty object matters: a `for_you: {}` on every
 * result would cost tokens on every search to say nothing, and would train the
 * model to ignore the field on the results where it is populated.
 */
export function forYou(
  candidate: {
    name: string;
    area: string | null;
    price_level: number | null;
    vibe_tags: readonly string[];
  },
  persona: Persona | null,
): ForYou | null {
  if (!persona) return null;

  const evidence: ForYou = {};

  const matches = overlap(candidate.vibe_tags, persona.vibes);
  if (matches.length > 0) evidence.matches = matches;

  // Surfaced, not filtered: the ask can legitimately call for something they
  // usually avoid ("somewhere loud for once"), and only the model reading the
  // ask can tell that apart from a mismatch.
  const clashes = overlap(candidate.vibe_tags, persona.avoidVibes);
  if (clashes.length > 0) evidence.clashes = clashes;

  if (
    candidate.area &&
    persona.areas.some((a) => a.toLowerCase() === candidate.area!.toLowerCase())
  ) {
    evidence.their_area = true;
  }

  if (
    persona.budgetBand > 0 &&
    candidate.price_level !== null &&
    candidate.price_level > persona.budgetBand
  ) {
    evidence.above_budget = true;
  }

  const savedNames = new Set(persona.savedRecently.map((n) => n.toLowerCase()));
  if (savedNames.has(candidate.name.toLowerCase())) {
    evidence.saved_before = true;
  }

  // Countable and current, where `matches` is a nightly aggregate score. The
  // difference is what the concierge can say: "matches your taste" versus "the
  // third one like this you've saved".
  const echoesSaves = strongestPattern(candidate.vibe_tags, persona.savedVibes);
  if (echoesSaves) evidence.echoes_saves = echoesSaves;

  const echoesPasses = strongestPattern(
    candidate.vibe_tags,
    persona.passedVibes,
  );
  if (echoesPasses) evidence.echoes_passes = echoesPasses;

  return Object.keys(evidence).length > 0 ? evidence : null;
}
