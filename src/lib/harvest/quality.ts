import "server-only";

/**
 * The "not crap" gate, ported from scout-engine and kept in sync with its
 * field learnings: a candidate ranks by evidence, chains are out (product
 * law), and names that game Google's listing rank low.
 */

const CHAIN_MARKERS = [
  "starbucks", "cafe coffee day", "ccd", "mcdonald", "domino", "pizza hut",
  "kfc", "burger king", "subway", "barbeque nation", "haldiram", "bikanervala",
  "chaayos", "chai point", "wow! momo", "wow momo", "behrouz", "faasos",
  "ovenstory", "la pino", "third wave coffee", "theobroma", "krispy kreme",
  "dunkin", "taco bell", "burger singh", "biryani blues", "biryani by kilo",
  "moti mahal delux", "sagar ratna", "pind balluchi", "berco",
  "coffeeshop company", "nothing before coffee", "7th heaven",
  "keventers", "frozen bottle", "mad over donuts", "giani",
];

const OUTLET_NOISE = /( - |, )(sector|phase|block|dlf|mall|branch)\b/i;
const SEO_NAME_NOISE = /\b(best|top|no\.?\s?1|famous)\b.*\b(in|of)\b/i;

export function isLikelyChain(name: string): boolean {
  const n = name.toLowerCase();
  return CHAIN_MARKERS.some((m) => n.includes(m));
}

export type ScorableCandidate = {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  sources: string[];
  storySignals: unknown[];
};

/** 0-100, a sortable default so the reviewer's eye lands on the strongest. */
export function qualityScore(place: ScorableCandidate): number {
  let score = 0;
  if (place.rating != null) score += Math.max(0, (place.rating - 3) * 40);
  if (place.reviewCount != null) {
    score += Math.min(16, Math.log10(Math.max(1, place.reviewCount)) * 4);
  }
  score += Math.min(8, (place.sources.length - 1) * 4);
  score += Math.min(12, place.storySignals.length * 3);
  if (OUTLET_NOISE.test(place.name)) score -= 10;
  if (SEO_NAME_NOISE.test(place.name)) score -= 12;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Null = passes; a string is the visible reason the gate held it back. */
export function gateReason(
  place: ScorableCandidate,
  opts: { minRating: number; minReviews: number },
): string | null {
  if (isLikelyChain(place.name)) return "chain blocklist";
  if (place.rating == null || place.reviewCount == null) {
    return "no rating evidence (uncorroborated)";
  }
  if (place.rating < opts.minRating) {
    return `rating ${place.rating} < ${opts.minRating}`;
  }
  if (place.reviewCount < opts.minReviews) {
    return `${place.reviewCount} reviews < ${opts.minReviews}`;
  }
  return null;
}
