import type {
  BudgetVerdict,
  CategoryEstimate,
  Market,
  MarketGuide,
  MarketIntelligence,
  MarketRunPlan,
  MarketSection,
  PlanStop,
  RequestedItem,
} from "./types";

/**
 * The market-run plan generator (pure). Given a market, its lanes and authored
 * playbook, the member's requested items + budget, and the aggregated
 * intelligence per category, it produces an ordered lane route with an honest
 * price estimate per item.
 *
 * Honesty is layered by trust: a corroborated recent sighting beats an
 * aggregated band beats the authored playbook beats nothing. When we have no
 * reliable number we say so ("ask around") rather than inventing one - the same
 * invariant intelligence.ts enforces, carried through to what the member reads.
 */

export interface BuildPlanInput {
  market: Market;
  sections: MarketSection[];
  guides: MarketGuide[];
  items: RequestedItem[];
  budgetMax: number | null;
  /** Aggregated intelligence per category (already through intelligence.ts). */
  intelByCategory: Map<string, MarketIntelligence>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The lane best matching a category by specialization, else by name; else none. */
function matchSection(
  category: string,
  sections: MarketSection[],
): MarketSection | null {
  const c = norm(category);
  const overlaps = (a: string, b: string) =>
    a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
  return (
    sections.find((s) => s.specialization && overlaps(norm(s.specialization), c)) ??
    sections.find((s) => overlaps(norm(s.name), c)) ??
    null
  );
}

function estimateFor(
  category: string,
  guide: MarketGuide | undefined,
  intel: MarketIntelligence | undefined,
): CategoryEstimate {
  const base = {
    category,
    bargainingNote: guide?.bargainingNote ?? null,
    qualityNote: guide?.qualityNote ?? null,
  };

  // 1) Live aggregate wins when it cleared the honesty bar.
  if (intel && intel.basis !== "insufficient" && intel.band) {
    return {
      ...base,
      priceBand: intel.band,
      basis: intel.basis, // "corroborated" | "band"
      confidence: intel.confidence,
      corroboratedShopId: intel.corroboratedShopId,
    };
  }
  // 2) Fall back to the authored playbook band, clearly marked as such.
  if (guide && guide.priceBandLow != null && guide.priceBandHigh != null) {
    return {
      ...base,
      priceBand: { low: guide.priceBandLow, high: guide.priceBandHigh },
      basis: "guide",
      confidence: guide.confidence,
      corroboratedShopId: null,
    };
  }
  // 3) Nothing reliable - never fabricate a number.
  return {
    ...base,
    priceBand: null,
    basis: "unknown",
    confidence: 0,
    corroboratedShopId: null,
  };
}

function budgetVerdict(
  low: number | null,
  high: number | null,
  budgetMax: number | null,
): BudgetVerdict {
  if (budgetMax == null || high == null || low == null) return "unknown";
  if (high <= budgetMax) return "feasible";
  if (low <= budgetMax) return "tight";
  return "over";
}

export function buildMarketRunPlan(input: BuildPlanInput): MarketRunPlan {
  const { market, sections, guides, items, budgetMax, intelByCategory } = input;

  const guideByCategory = new Map(guides.map((g) => [norm(g.category), g]));

  // One estimate per distinct category, input order preserved.
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const it of items) {
    const key = norm(it.category);
    if (key && !seen.has(key)) {
      seen.add(key);
      categories.push(it.category);
    }
  }

  // Bucket estimates by the lane that best serves each category.
  const stopsByKey = new Map<
    string,
    { section: MarketSection | null; estimates: CategoryEstimate[] }
  >();
  for (const category of categories) {
    const estimate = estimateFor(
      category,
      guideByCategory.get(norm(category)),
      intelByCategory.get(category),
    );
    const section = matchSection(category, sections);
    const key = section?.id ?? "__general__";
    const bucket = stopsByKey.get(key) ?? { section, estimates: [] };
    bucket.estimates.push(estimate);
    stopsByKey.set(key, bucket);
  }

  // Order: fuller lanes first; the catch-all general stop last.
  const stops: PlanStop[] = [...stopsByKey.values()]
    .sort((a, b) => {
      if (!a.section) return 1;
      if (!b.section) return -1;
      if (b.estimates.length !== a.estimates.length) {
        return b.estimates.length - a.estimates.length;
      }
      return a.section.name.localeCompare(b.section.name);
    })
    .map((b) => ({
      section: b.section?.name ?? null,
      specialization: b.section?.specialization ?? null,
      estimates: b.estimates,
    }));

  // Totals from every estimate that has a band (unknowns contribute nothing).
  const banded = stops
    .flatMap((s) => s.estimates)
    .filter((e) => e.priceBand != null);
  const estimatedLow = banded.length
    ? banded.reduce((s, e) => s + e.priceBand!.low, 0)
    : null;
  const estimatedHigh = banded.length
    ? banded.reduce((s, e) => s + e.priceBand!.high, 0)
    : null;

  const verdict = budgetVerdict(estimatedLow, estimatedHigh, budgetMax);

  const notes: string[] = [];
  const allEstimates = stops.flatMap((s) => s.estimates);
  for (const e of allEstimates) {
    if (e.basis === "guide") {
      notes.push(
        `${e.category}: price range is from our playbook, not recent sightings.`,
      );
    } else if (e.basis === "unknown") {
      notes.push(
        `${e.category}: no reliable price data yet - ask around, then tell us what you paid.`,
      );
    }
  }
  if (verdict === "over") {
    notes.push(
      `Heads up: even at the low end this runs over your budget of ₹${budgetMax}.`,
    );
  } else if (verdict === "tight") {
    notes.push(`Doable within ₹${budgetMax}, but you'll need to bargain well.`);
  }

  return {
    marketSlug: market.slug,
    marketName: market.name,
    stops,
    estimatedLow,
    estimatedHigh,
    budgetMax,
    budgetVerdict: verdict,
    notes,
  };
}
