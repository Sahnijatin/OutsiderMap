/**
 * The franchise filter.
 *
 * OutsiderMap's product law is "no chains", but the naive reading of that -
 * exclude anything with several outlets - deletes exactly the places the map
 * exists for. A ninety-year-old halwai whose grandsons run six shops is not
 * a chain in any sense a user cares about. A two-outlet cloud kitchen
 * franchise is.
 *
 * So the rule is the *business model*, not the outlet count: franchised or
 * centrally-commissaried operations are out, owner-run operations stay in
 * however many doors they have.
 *
 * Three layers, cheapest first, because at NCR scale we cannot pay an LLM to
 * think about a hundred thousand rows:
 *
 *   1. brand match  - a maintained list of franchise operators. Catches most
 *                     of it for nothing.
 *   2. count signal - the same name at many locations. NOT a verdict on its
 *                     own under our rule; it raises the row for review.
 *   3. human / LLM  - whatever survives, which should be a small pile.
 *
 * Pure functions with no I/O so the whole thing is testable and can run
 * inside an import loop.
 */

export type FranchiseVerdict = {
  /** `chain` excludes it, `independent` keeps it, `review` needs a human. */
  verdict: "chain" | "independent" | "review";
  reason: string;
};

/**
 * Franchise operators common in Indian cities. Matched on normalised tokens,
 * so casing, punctuation and "Pizza"/"Cafe" suffixes do not matter.
 *
 * Deliberately does NOT include multi-outlet independents that people think
 * of as institutions - Karim's, Kake di Hatti, Moti Mahal and their like are
 * owner-run and belong on the map.
 */
const FRANCHISE_BRANDS = [
  // Global QSR and coffee
  "mcdonalds", "kfc", "burger king", "subway", "dominos", "pizza hut",
  "papa johns", "starbucks", "costa coffee", "dunkin", "dunkin donuts",
  "krispy kreme", "taco bell", "wendys", "popeyes", "carls jr",
  "baskin robbins", "cinnabon", "auntie annes", "johnny rockets",
  // Indian QSR and cafe chains
  "cafe coffee day", "ccd", "barista", "chaayos", "chai point", "chai sutta bar",
  "third wave coffee", "blue tokai", "wow momo", "wow china", "faasos",
  "behrouz biryani", "ovenstory", "la pinoz", "pizza express",
  "keventers", "biryani blues", "biryani by kilo", "haldirams", "bikanervala",
  "sagar ratna", "nirulas", "giani", "cream bell", "naturals ice cream",
  "havmor", "amul parlour", "mother dairy", "corner house",
  // Casual dining groups
  "barbeque nation", "absolute barbecues", "mainland china", "oh calcutta",
  "social", "smoke house deli", "cafe delhi heights", "big chill",
  "farzi cafe", "bombay to barcelona", "burger singh", "leon grill",
  "the belgian waffle co", "belgian waffle", "theobroma", "sweet truth",
  "wenger", "monginis", "ribbons and balloons",
  // Bakery / grocery / retail chains that show up as "places"
  "bakers street", "l opera", "lopera", "bread and more",
  // Retail chains that arrive as "cultural" venues from POI data.
  "crossword", "om book shop", "oxford bookstore", "starmark",
  "reliance fresh", "more supermarket", "spencers", "big bazaar",
  "dmart", "vishal mega mart", "24 seven", "easyday",
];

/** Terms that describe a franchise arrangement wherever they appear. */
const FRANCHISE_MARKERS = [
  "franchise",
  "franchisee",
  "outlet of",
  "authorised dealer",
  "authorized dealer",
];

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Above this many same-named venues in one metro, we want a human to look -
 * not because count decides it, but because it is a cheap way to surface the
 * franchises our brand list has not caught yet.
 */
export const REVIEW_OUTLET_COUNT = 4;

export function isFranchiseBrand(name: string): boolean {
  const n = normaliseName(name);
  if (!n) return false;
  return FRANCHISE_BRANDS.some((brand) => {
    const b = normaliseName(brand);
    // Whole-token containment, so "social" matches "Social" and "Def Col
    // Social" but not "Social Kitchen Collective" by accident of substring.
    return n === b || n.startsWith(`${b} `) || n.endsWith(` ${b}`) ||
      n.includes(` ${b} `);
  });
}

export function classifyPlace(input: {
  name: string;
  /** Free text we have about it - description, category, editor note. */
  text?: string | null;
  /** How many venues share this normalised name in the same metro. */
  outletCount?: number;
  /** A human has already ruled on this one; their call wins. */
  humanVerdict?: "chain" | "independent" | null;
}): FranchiseVerdict {
  if (input.humanVerdict) {
    return {
      verdict: input.humanVerdict,
      reason: "set by a human",
    };
  }

  if (isFranchiseBrand(input.name)) {
    return { verdict: "chain", reason: "known franchise brand" };
  }

  const text = normaliseName(input.text ?? "");
  const marker = FRANCHISE_MARKERS.find((m) => text.includes(normaliseName(m)));
  if (marker) {
    return { verdict: "chain", reason: `describes itself as a ${marker}` };
  }

  const count = input.outletCount ?? 1;
  if (count >= REVIEW_OUTLET_COUNT) {
    // Under our rule this is NOT a verdict. Plenty of beloved independents
    // have this many doors, so a person decides.
    return {
      verdict: "review",
      reason: `${count} venues share this name - franchise or family?`,
    };
  }

  return { verdict: "independent", reason: "no franchise signal" };
}

/**
 * Group places by normalised name so `outletCount` can be computed once for a
 * whole import batch rather than queried per row.
 */
export function countByName(
  places: { name: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of places) {
    const key = normaliseName(p.name);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
