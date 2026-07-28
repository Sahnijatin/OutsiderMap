/**
 * The "not crap" gate. A place survives only when the evidence says people
 * genuinely rate it - and it isn't a franchise clone. Thresholds are CLI
 * flags; the chain blocklist encodes OutsiderMap's product law (no chains).
 */

const CHAIN_MARKERS = [
  "starbucks", "cafe coffee day", "ccd", "mcdonald", "domino", "pizza hut",
  "kfc", "burger king", "subway", "barbeque nation", "haldiram", "bikanervala",
  "chaayos", "chai point", "wow! momo", "wow momo", "behrouz", "faasos",
  "ovenstory", "la pino", "third wave coffee", "theobroma", "krispy kreme",
  "dunkin", "taco bell", "burger singh", "biryani blues", "biryani by kilo",
  "moti mahal delux", "sagar ratna", "pind balluchi", "berco",
  // Caught slipping through real Delhi/Gurugram harvests:
  "coffeeshop company", "nothing before coffee", "7th heaven",
  "keventers", "frozen bottle", "mad over donuts", "giani",
];

/**
 * SEO-stuffed listing names ("New Sky Coffee, Best Cafe in Chittaranjan
 * Park Delhi") signal a place gaming Google rather than earning word of
 * mouth - penalized, not banned, so the reviewer still sees them low down.
 */
const SEO_NAME_NOISE = /\b(best|top|no\.?\s?1|famous)\b.*\b(in|of)\b/i;

/** Marks obvious multi-outlet noise in the name itself ("... - Sector 18"). */
const OUTLET_NOISE = /( - |, )(sector|phase|block|dlf|mall|branch)\b/i;

export function isLikelyChain(name) {
  const n = name.toLowerCase();
  return CHAIN_MARKERS.some((m) => n.includes(m));
}

/**
 * Score 0-100 from the merged evidence. Not a ranking to worship - a sortable
 * default for the manual-verification sheet, so the reviewer's eye lands on
 * the strongest candidates first.
 */
export function qualityScore(place) {
  let score = 0;
  if (place.rating != null) {
    // 4.0 -> 40 ... 5.0 -> 80, sub-4 falls away fast.
    score += Math.max(0, (place.rating - 3) * 40);
  }
  if (place.reviewCount != null) {
    // log-scale: 100 reviews ~ +8, 1k ~ +12, 10k ~ +16.
    score += Math.min(16, Math.log10(Math.max(1, place.reviewCount)) * 4);
  }
  // Independent corroboration: found by more than one source.
  score += Math.min(8, (place.sources.length - 1) * 4);
  // Story evidence found in reviews/descriptions - the whole point.
  score += Math.min(12, place.storySignals.length * 3);
  if (OUTLET_NOISE.test(place.name)) score -= 10;
  if (SEO_NAME_NOISE.test(place.name)) score -= 12;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function passesGate(place, opts) {
  if (isLikelyChain(place.name)) {
    return { pass: false, reason: "chain blocklist" };
  }
  const rated = place.rating != null && place.reviewCount != null;
  if (!rated) {
    // Discovery-only finds (e.g. OSM alone) need corroboration to survive,
    // unless the run explicitly keeps them for manual triage.
    return opts.keepUnrated
      ? { pass: true, reason: "unrated (kept for triage)" }
      : { pass: false, reason: "no rating evidence" };
  }
  if (place.rating < opts.minRating) {
    return { pass: false, reason: `rating ${place.rating} < ${opts.minRating}` };
  }
  if (place.reviewCount < opts.minReviews) {
    return {
      pass: false,
      reason: `${place.reviewCount} reviews < ${opts.minReviews}`,
    };
  }
  return { pass: true, reason: "ok" };
}
