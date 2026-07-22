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

// ---------------------------------------------------------------------------
// Market entities (domain shapes over the DB rows) + the generated run plan.
// ---------------------------------------------------------------------------

export interface Market {
  id: string;
  slug: string;
  name: string;
  city: string;
  area: string | null;
  categories: string[];
  character: string | null;
}

export interface MarketSection {
  id: string;
  name: string;
  specialization: string | null;
  notes: string | null;
}

/** The authored Tier-1 playbook entry for a category in a market. */
export interface MarketGuide {
  category: string;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  bargainingNote: string | null;
  qualityNote: string | null;
  confidence: number;
}

/** What the member wants to buy this trip. */
export interface RequestedItem {
  category: string;
  item?: string | null;
}

/**
 * Where a stop's price estimate came from - member-facing honesty. Ordered by
 * trust: a corroborated recent sighting > an aggregated band > the authored
 * playbook > nothing reliable yet.
 */
export type PriceBasis = "corroborated" | "band" | "guide" | "unknown";

export interface CategoryEstimate {
  category: string;
  priceBand: PriceBand | null;
  basis: PriceBasis;
  confidence: number;
  bargainingNote: string | null;
  qualityNote: string | null;
  /** A shop safe to name, only when basis is "corroborated". */
  corroboratedShopId: string | null;
}

/** One lane/section to hit, with the estimates for the items it covers. */
export interface PlanStop {
  section: string | null;
  specialization: string | null;
  estimates: CategoryEstimate[];
}

/** Whether the requested budget covers the estimated spend - stated honestly. */
export type BudgetVerdict = "feasible" | "tight" | "over" | "unknown";

/** The generated market game-plan snapshot stored on a market_run. */
export interface MarketRunPlan {
  marketSlug: string;
  marketName: string;
  stops: PlanStop[];
  estimatedLow: number | null;
  estimatedHigh: number | null;
  budgetMax: number | null;
  budgetVerdict: BudgetVerdict;
  /** Honest caveats surfaced to the member (stale data, playbook-only, etc.). */
  notes: string[];
}
