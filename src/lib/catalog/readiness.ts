/**
 * What a place needs before it is allowed to face a member.
 *
 * Inventory is the ceiling on personalization. `searchCatalog` pulls 24 and
 * narrows to 12; drawn from a small retrievable catalog and then filtered by
 * area and price, two members with opposite taste see overlapping sets by
 * arithmetic, however good the ranker is. So publishing the ~6,100 imported
 * drafts is worth more than any prompt change in this repo.
 *
 * But only the ones that are actually ready. Publishing a thin row does not
 * raise the ceiling, it lowers the floor: a place with no tags can never
 * produce personal evidence, a place with no description embeds to almost
 * nothing and pollutes retrieval for every query near it, and a place with no
 * area silently drops out of every area-scoped ask. More inventory that cannot
 * be matched on is worse than less inventory, because it displaces things that
 * can.
 *
 * Pure and dependency-free so the rule has exactly one definition: the admin
 * gate, the metrics tile, and the tests all read it from here.
 */

/** The columns the rule reads. */
export interface ReadinessInput {
  name: string | null;
  area: string | null;
  description: string | null;
  vibe_tags: string[] | null;
  lat: number | null;
  lng: number | null;
  is_chain: boolean | null;
}

export type ReadinessGap =
  | "name"
  | "area"
  | "description"
  | "vibe_tags"
  | "coordinates"
  | "chain";

/** Plain words for the admin surface; the union members are schema vocabulary. */
export const GAP_LABELS: Record<ReadinessGap, string> = {
  name: "No name",
  area: "No area",
  description: "No description",
  vibe_tags: "No vibe tags",
  coordinates: "No coordinates",
  chain: "Chain",
};

/**
 * A description shorter than this is a stub - "Popular cafe in Delhi" and the
 * like, which the importers produce in bulk. It embeds to roughly the same
 * vector as every other stub, so a hundred of them collapse into one
 * undifferentiated blob sitting in the middle of the catalog.
 */
export const MIN_DESCRIPTION_CHARS = 40;

/**
 * Everything standing between this place and a member, in the order an editor
 * would fix them. Empty means ready.
 */
export function readinessGaps(place: ReadinessInput): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];

  // Product law, not a quality bar: chains never surface, so a chain is not
  // an unfinished draft - it is one that must never be published at all.
  if (place.is_chain) gaps.push("chain");

  if (!place.name?.trim()) gaps.push("name");
  if (!place.area?.trim()) gaps.push("area");
  if ((place.description?.trim().length ?? 0) < MIN_DESCRIPTION_CHARS) {
    gaps.push("description");
  }
  if ((place.vibe_tags?.length ?? 0) === 0) gaps.push("vibe_tags");
  // Both halves or neither: one coordinate is worse than none, because it
  // places the pin in the sea off Africa rather than nowhere.
  if (place.lat === null || place.lng === null) gaps.push("coordinates");

  return gaps;
}

export function isReadyToPublish(place: ReadinessInput): boolean {
  return readinessGaps(place).length === 0;
}

/**
 * ## What deliberately does NOT block a publish
 *
 * - `image_path`. A place with no photo still answers the question, and the
 *   pick card already falls back to its initial. Blocking on images would hold
 *   back most of the catalog for a cosmetic reason.
 * - `editor_note`. It is the fallback reason on a pick card, and since the
 *   agent writes its own reason for the member it is the path we would rather
 *   members did not see anyway.
 * - `price_level`. Plenty of real places have no meaningful band, and guessing
 *   one to clear a gate would put a wrong number in front of a member.
 * - `hours`. `check_open_now` degrades honestly to "no hours on file", which is
 *   a true statement; a fabricated closing time is not.
 *
 * The line is drawn at things retrieval and ranking cannot work without, not at
 * things a finished listing would have.
 */
