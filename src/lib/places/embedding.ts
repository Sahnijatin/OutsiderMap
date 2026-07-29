import "server-only";
import { getEmbeddings } from "@/lib/ai";
import type { Json } from "@/types/database";

type EmbeddablePlace = {
  name: string;
  category: string | null;
  area: string | null;
  vibe_tags: string[];
  description: string | null;
  editor_note: string | null;
  best_for: Json | null;
  price_level: number | null;
};

/**
 * The text a place is matched on. Must stay in sync with
 * scripts/seed-places.mjs (kept standalone so it can run without Next).
 */
export function placeEmbeddingText(place: EmbeddablePlace) {
  const bestFor = (place.best_for ?? {}) as {
    moods?: string[];
    times?: string[];
    group?: string[];
  };
  return [
    `${place.name} - ${place.category ?? "place"} in ${place.area ?? "Delhi NCR"}, Delhi NCR.`,
    place.vibe_tags.length > 0 && `Vibe: ${place.vibe_tags.join(", ")}.`,
    place.description,
    place.editor_note,
    bestFor.moods?.length && `Best for moods: ${bestFor.moods.join(", ")}.`,
    (bestFor.times?.length || bestFor.group?.length) &&
      `Best times: ${(bestFor.times ?? []).join(", ")}. Groups: ${(bestFor.group ?? []).join(", ")}.`,
    place.price_level && `Price level ${place.price_level} of 4.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The quality floor for retrieval.
 *
 * `match_places` filters `embedding is not null`, so whether a row has a vector
 * is already the switch that decides if chat, search and recommendations can
 * see it. That makes the embedding write the right place to enforce quality:
 * every publish path runs through it, including the ones that never touch the
 * admin readiness gate - quorum publishes, harvest approvals, hand-run SQL,
 * and the nightly sweep that mops up after all of them.
 *
 * ## What it is defending against
 *
 * A row carrying nothing but its name, category and area embeds to almost the
 * same vector as every other such row - they land in a tight cluster near the
 * centroid of "generic place in this city". Against a specific ask they lose
 * harmlessly. Against a vague one ("somewhere nice tonight") the query vector
 * is generic too, so they compete, and a shortlist of 24 candidates can fill
 * with near-duplicates of each other while the three places that could have
 * answered the question sit below the cut.
 *
 * They also cannot be recommended well even when they do surface: `for_you`
 * matches on vibe tags, so an untagged place yields no personal evidence, and
 * with no editor note the card falls back to nothing. A stub does not merely
 * take a slot - it guarantees a generic answer in that slot.
 *
 * ## Why it counts novel words rather than characters
 *
 * "Does it have a description" is not the test, because the stubs have one.
 * The harvest approve fallback writes `"<name> - a <category> in <city>."`
 * verbatim when copy generation fails, which is a description that restates
 * the skeleton and adds no way to find the place. So this asks the only
 * question that matters for retrieval: how much is here that a search could
 * match on which is not already in the name, category and area?
 */

/** Roughly one real sentence of actual content beyond the skeleton. */
const MIN_NOVEL_WORDS = 12;

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

/**
 * Words in the prose that are not already in the name, category or area.
 *
 * Exported for the admin surfaces, which report how close a blocked row is
 * rather than only that it is blocked - "needs a few more words" and "needs
 * everything" are different jobs for whoever has to fix it.
 */
export function novelWordCount(place: EmbeddablePlace): number {
  const skeleton = new Set(
    words(`${place.name} ${place.category ?? ""} ${place.area ?? ""}`),
  );
  const prose = words(`${place.description ?? ""} ${place.editor_note ?? ""}`);
  return new Set(prose.filter((w) => !skeleton.has(w))).size;
}

/**
 * Whether this place carries enough to be worth matching on.
 *
 * Vibe tags alone qualify: "rooftop, late-night" is genuinely matchable
 * vocabulary and is exactly what `for_you` reads, so a tagged place with thin
 * prose is still a real answer to a real ask. Prose alone qualifies too. Only
 * a row with neither is refused.
 */
export function isEmbeddable(place: EmbeddablePlace): boolean {
  if (place.vibe_tags.length > 0) return true;
  return novelWordCount(place) >= MIN_NOVEL_WORDS;
}

export async function embedPlace(place: EmbeddablePlace) {
  const [embedding] = await getEmbeddings().embed([placeEmbeddingText(place)]);
  return embedding;
}
