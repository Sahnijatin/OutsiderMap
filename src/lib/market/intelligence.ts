import type {
  MarketIntelligence,
  PriceBand,
  PricePoint,
  PriceSource,
} from "./types";

/**
 * The market-intelligence aggregator (pure). Turns a pile of price
 * observations - authored, content-mined, and user-reported - into one honest
 * answer, weighted by trust x freshness.
 *
 * The hard invariant (tested): we NEVER surface a single-source or stale claim
 * as fact. One old video saying "Shop 27, ₹300" yields `insufficient`, not a
 * number. Only corroborated, recent data earns a band; only a shop with enough
 * recent independent sightings is named. Fabricated precision destroys trust,
 * so the bar to assert a number is deliberately high.
 */

/** Base trust by source: a first-party report outranks a mined caption. */
const SOURCE_WEIGHT: Record<PriceSource, number> = {
  user_report: 1,
  content_mined: 0.6,
  authored: 0.75,
};

/** Weight halves every this-many days: a 4-month-old price is worth ~half. */
const HALF_LIFE_DAYS = 120;
/** Undated records (authored/mined without a date) get a low, fixed recency. */
const UNDATED_DECAY = 0.3;
/** Older than this is "stale": it can inform, but never counts as fresh. */
const STALE_DAYS = 180;

/** Need at least this many weighted observations to assert a band at all. */
const MIN_POINTS_FOR_BAND = 2;
/** ...and this much summed weight, so two feather-light records don't qualify. */
const MIN_WEIGHT_FOR_BAND = 0.5;
/** A shop must have this many fresh sightings before we dare name it. */
const MIN_SIGHTINGS_FOR_SHOP = 3;

const DAY_MS = 86_400_000;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function ageDays(observedAt: Date | null, now: Date): number | null {
  if (!observedAt) return null;
  // Clamp future timestamps to "now" so a bad date can't inflate recency.
  return Math.max(0, (now.getTime() - observedAt.getTime()) / DAY_MS);
}

/** Recency multiplier in (0, 1]. Undated → a low floor; future → treated as now. */
function decay(observedAt: Date | null, now: Date): number {
  const age = ageDays(observedAt, now);
  if (age === null) return UNDATED_DECAY;
  return Math.pow(0.5, age / HALF_LIFE_DAYS);
}

/** Fresh = dated and within the stale window. Undated is never fresh. */
function isFresh(p: PricePoint, now: Date): boolean {
  const age = ageDays(p.observedAt, now);
  return age !== null && age <= STALE_DAYS;
}

function weight(p: PricePoint, now: Date): number {
  return SOURCE_WEIGHT[p.source] * clamp01(p.confidence) * decay(p.observedAt, now);
}

/**
 * Weighted quantile over (value, weight) pairs, pre-sorted by value. `q` in
 * [0,1]. Used to trim outliers honestly instead of taking raw min/max, so one
 * wild sticker price can't widen the band.
 */
function weightedQuantile(
  sorted: { price: number; w: number }[],
  totalWeight: number,
  q: number,
): number {
  const target = totalWeight * q;
  let cumulative = 0;
  for (const point of sorted) {
    cumulative += point.w;
    if (cumulative >= target) return point.price;
  }
  return sorted[sorted.length - 1].price;
}

const EMPTY: MarketIntelligence = {
  basis: "insufficient",
  band: null,
  confidence: 0,
  sampleSize: 0,
  freshSampleSize: 0,
  corroboratedShopId: null,
};

/**
 * Aggregate price observations into a member-safe answer. `now` is injected so
 * results are deterministic (and testable); it defaults to the current time.
 */
export function aggregate(
  points: PricePoint[],
  now: Date = new Date(),
): MarketIntelligence {
  if (points.length === 0) return EMPTY;

  const weighted = points
    .map((p) => ({ price: p.price, w: weight(p, now), fresh: isFresh(p, now) }))
    .filter((p) => p.w > 0 && Number.isFinite(p.price));
  if (weighted.length === 0) return { ...EMPTY, sampleSize: points.length };

  const totalWeight = weighted.reduce((s, p) => s + p.w, 0);
  const freshSampleSize = weighted.filter((p) => p.fresh).length;

  // A shop we can name: enough fresh, distinct sightings agreeing on it.
  const corroboratedShopId = findCorroboratedShop(points, now);

  // Not enough to assert a number: guidance only, never fabricated precision.
  const eligibleForBand =
    weighted.length >= MIN_POINTS_FOR_BAND &&
    totalWeight >= MIN_WEIGHT_FOR_BAND &&
    freshSampleSize >= 1;
  if (!eligibleForBand && !corroboratedShopId) {
    return {
      ...EMPTY,
      sampleSize: points.length,
      freshSampleSize,
    };
  }

  // Weighted interquartile range: trims a lone outlier (up to ~a quarter of
  // the mass) off each end so one wild sticker price can't blow out the band.
  const sorted = [...weighted].sort((a, b) => a.price - b.price);
  const band: PriceBand = {
    low: weightedQuantile(sorted, totalWeight, 0.25),
    high: weightedQuantile(sorted, totalWeight, 0.75),
  };

  // Confidence saturates with evidence and rises with corroboration; a wide
  // band (relative to its midpoint) pulls it back down.
  const evidence = totalWeight / (totalWeight + 2);
  const mid = (band.low + band.high) / 2;
  const spreadPenalty = mid > 0 ? clamp01((band.high - band.low) / mid) : 1;
  const confidence = clamp01(
    evidence * (1 - 0.4 * spreadPenalty) * (corroboratedShopId ? 1.15 : 1),
  );

  return {
    basis: corroboratedShopId ? "corroborated" : "band",
    band,
    confidence,
    sampleSize: points.length,
    freshSampleSize,
    corroboratedShopId,
  };
}

/**
 * The shop (if any) with enough fresh, distinct sightings to name safely.
 * "Distinct" is approximated by counting fresh observations per shop; a single
 * repeated source can't manufacture a quorum because each observation is one
 * record. Returns null unless a shop clears MIN_SIGHTINGS_FOR_SHOP.
 */
function findCorroboratedShop(points: PricePoint[], now: Date): string | null {
  const freshByShop = new Map<string, number>();
  for (const p of points) {
    if (!p.shopId || !isFresh(p, now)) continue;
    freshByShop.set(p.shopId, (freshByShop.get(p.shopId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [shopId, count] of freshByShop) {
    if (count >= MIN_SIGHTINGS_FOR_SHOP && count > bestCount) {
      best = shopId;
      bestCount = count;
    }
  }
  return best;
}
