/**
 * Market-intelligence shared types (#68). The aggregation over `PricePoint`s
 * lives in intelligence.ts; these types are the contract between the store,
 * the aggregator, and (later) the planner + admin surfaces.
 */

/** Where a price observation came from - drives its base trust weight. */
export type PriceSource = "authored" | "content_mined" | "user_report";

/** One price observation for a (market, category[, shop]). */
export interface PricePoint {
  price: number;
  source: PriceSource;
  /** Per-record confidence, 0..1 (extraction certainty / reporter trust). */
  confidence: number;
  /** When the price was observed; null for undated authored/mined records. */
  observedAt: Date | null;
  /** The shop this price was seen at, when known. */
  shopId?: string | null;
}

/** An honest price range - never a single fabricated point. */
export interface PriceBand {
  low: number;
  high: number;
}

/**
 * The aggregate a member is allowed to see.
 *
 * - `insufficient`: too little (or only single-source / stale) data - we show
 *   guidance, never a number presented as fact.
 * - `band`: enough corroboration for an honest range.
 * - `corroborated`: a specific shop has enough recent, independent sightings
 *   to name safely.
 */
export interface MarketIntelligence {
  basis: "insufficient" | "band" | "corroborated";
  /** Null iff basis is "insufficient". */
  band: PriceBand | null;
  /** Overall trust in the aggregate, 0..1. */
  confidence: number;
  /** Total observations considered. */
  sampleSize: number;
  /** Observations recent enough to count as fresh. */
  freshSampleSize: number;
  /** Set only when basis is "corroborated" - safe to name to a member. */
  corroboratedShopId: string | null;
}
