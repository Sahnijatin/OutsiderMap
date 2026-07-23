import type { MarketIntelligence, MarketRunPlan } from "./types";

/**
 * Turn market intelligence + a run plan into the text the chat agent receives
 * (pure, so the honesty of what it presents is unit-tested). The one rule: what
 * goes to the model is already honest - a band or a "we don't know", never a
 * single fabricated price - so the agent physically cannot quote precision it
 * wasn't given.
 */

/** An honest one-liner for a single (market, category) intelligence result. */
export function intelligenceLine(
  marketName: string,
  category: string,
  intel: MarketIntelligence,
): string {
  if (intel.basis === "insufficient" || !intel.band) {
    return `No reliable price data for ${category} at ${marketName} yet. Do not quote a price - tell the user to ask around, and invite them to report back what they paid.`;
  }
  const range = `~₹${intel.band.low}-${intel.band.high}`;
  const seen = `${intel.freshSampleSize} recent of ${intel.sampleSize} observations`;
  if (intel.basis === "corroborated") {
    return `${category} at ${marketName}: ${range} (corroborated across ${seen}; a specific shop is well-corroborated). Present as a band, not an exact price.`;
  }
  return `${category} at ${marketName}: ${range} (aggregated from ${seen}). Present as a band, never an exact price.`;
}

/**
 * The structured payload the build_market_run tool hands back to the model.
 * Every priced line is a band; unknowns are surfaced as such, not dropped
 * silently, so the agent can be honest about coverage.
 */
export function planToModelPayload(plan: MarketRunPlan): Record<string, unknown> {
  return {
    market: plan.marketName,
    budget_max: plan.budgetMax,
    budget_verdict: plan.budgetVerdict,
    estimated_total: {
      low: plan.estimatedLow,
      high: plan.estimatedHigh,
    },
    stops: plan.stops.map((s) => ({
      lane: s.section ?? "general market",
      specialization: s.specialization,
      items: s.estimates.map((e) => ({
        category: e.category,
        // A band or null - never a single price presented as fact.
        price_band: e.priceBand,
        basis: e.basis,
        bargaining: e.bargainingNote,
      })),
    })),
    notes: plan.notes,
    guardrail:
      "Present price ranges as bands, never exact. Where basis is 'guide' say it's a rough playbook figure; where 'unknown' tell the user to ask around. The plan is saved and trackable.",
  };
}
