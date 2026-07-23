import { describe, expect, it } from "vitest";
import { intelligenceLine, planToModelPayload } from "@/lib/market/present";
import type { MarketIntelligence, MarketRunPlan } from "@/lib/market/types";

const intel = (over: Partial<MarketIntelligence>): MarketIntelligence => ({
  basis: "band",
  band: { low: 300, high: 450 },
  confidence: 0.6,
  sampleSize: 6,
  freshSampleSize: 4,
  corroboratedShopId: null,
  ...over,
});

describe("intelligenceLine", () => {
  it("refuses to quote a price when data is insufficient", () => {
    const line = intelligenceLine("Sarojini Nagar", "fashion", intel({
      basis: "insufficient",
      band: null,
    }));
    expect(line).toContain("ask around");
    expect(line).not.toMatch(/₹\d/); // no fabricated number
  });

  it("gives a band, explicitly not an exact price", () => {
    const line = intelligenceLine("Sarojini Nagar", "fashion", intel({}));
    expect(line).toContain("₹300-450");
    expect(line.toLowerCase()).toContain("never an exact price");
  });

  it("notes corroboration without leaking an exact price", () => {
    const line = intelligenceLine(
      "Sarojini Nagar",
      "fashion",
      intel({ basis: "corroborated", corroboratedShopId: "shop-7" }),
    );
    expect(line).toContain("corroborated");
    expect(line).not.toContain("shop-7"); // an id is never surfaced verbatim
  });
});

describe("planToModelPayload", () => {
  const plan: MarketRunPlan = {
    marketSlug: "sarojini-nagar",
    marketName: "Sarojini Nagar",
    stops: [
      {
        section: "Export back-lane",
        specialization: "fashion",
        estimates: [
          {
            category: "fashion",
            priceBand: { low: 300, high: 500 },
            basis: "band",
            confidence: 0.6,
            bargainingNote: "quote 40%",
            qualityNote: null,
            corroboratedShopId: null,
          },
          {
            category: "shoes",
            priceBand: null,
            basis: "unknown",
            confidence: 0,
            bargainingNote: null,
            qualityNote: null,
            corroboratedShopId: null,
          },
        ],
      },
    ],
    estimatedLow: 300,
    estimatedHigh: 500,
    budgetMax: 1000,
    budgetVerdict: "feasible",
    notes: ["shoes: no reliable price data yet - ask around."],
  };

  it("emits bands (or null), never a bare exact price, and carries the verdict", () => {
    const payload = planToModelPayload(plan) as {
      budget_verdict: string;
      stops: { items: { price_band: unknown; basis: string }[] }[];
      guardrail: string;
    };
    expect(payload.budget_verdict).toBe("feasible");
    const items = payload.stops.flatMap((s) => s.items);
    expect(items[0].price_band).toEqual({ low: 300, high: 500 });
    expect(items[1].price_band).toBeNull(); // unknown stays null, surfaced not hidden
    expect(payload.guardrail.toLowerCase()).toContain("never exact");
  });
});
