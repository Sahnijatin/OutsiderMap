import { describe, expect, it } from "vitest";
import { buildMarketRunPlan } from "@/lib/market/plan";
import type {
  Market,
  MarketGuide,
  MarketIntelligence,
  MarketSection,
} from "@/lib/market/types";

const MARKET: Market = {
  id: "m1",
  slug: "sarojini-nagar",
  name: "Sarojini Nagar",
  city: "delhi",
  area: "South Delhi",
  categories: ["fashion", "ethnic"],
  character: "export-surplus fashion at haggling prices",
};

const SECTIONS: MarketSection[] = [
  { id: "s1", name: "Export back-lane", specialization: "fashion", notes: null },
  { id: "s2", name: "Ethnic block", specialization: "ethnic wear", notes: null },
];

const guide = (over: Partial<MarketGuide> & { category: string }): MarketGuide => ({
  priceBandLow: null,
  priceBandHigh: null,
  bargainingNote: null,
  qualityNote: null,
  confidence: 0.5,
  ...over,
});

const intel = (over: Partial<MarketIntelligence>): MarketIntelligence => ({
  basis: "band",
  band: { low: 200, high: 400 },
  confidence: 0.6,
  sampleSize: 4,
  freshSampleSize: 4,
  corroboratedShopId: null,
  ...over,
});

describe("buildMarketRunPlan - price basis layering", () => {
  it("prefers live aggregate over the authored guide", () => {
    const plan = buildMarketRunPlan({
      market: MARKET,
      sections: SECTIONS,
      guides: [guide({ category: "fashion", priceBandLow: 100, priceBandHigh: 900 })],
      items: [{ category: "fashion" }],
      budgetMax: null,
      intelByCategory: new Map([["fashion", intel({ band: { low: 250, high: 450 } })]]),
    });
    const est = plan.stops[0].estimates[0];
    expect(est.basis).toBe("band");
    expect(est.priceBand).toEqual({ low: 250, high: 450 });
  });

  it("falls back to the authored guide, clearly marked", () => {
    const plan = buildMarketRunPlan({
      market: MARKET,
      sections: SECTIONS,
      guides: [guide({ category: "fashion", priceBandLow: 100, priceBandHigh: 500 })],
      items: [{ category: "fashion" }],
      budgetMax: null,
      intelByCategory: new Map([["fashion", intel({ basis: "insufficient", band: null })]]),
    });
    const est = plan.stops[0].estimates[0];
    expect(est.basis).toBe("guide");
    expect(est.priceBand).toEqual({ low: 100, high: 500 });
    expect(plan.notes.some((n) => n.includes("playbook"))).toBe(true);
  });

  it("never fabricates a number when nothing is reliable", () => {
    const plan = buildMarketRunPlan({
      market: MARKET,
      sections: SECTIONS,
      guides: [],
      items: [{ category: "sneakers" }],
      budgetMax: null,
      intelByCategory: new Map([["sneakers", intel({ basis: "insufficient", band: null })]]),
    });
    const est = plan.stops[0].estimates[0];
    expect(est.basis).toBe("unknown");
    expect(est.priceBand).toBeNull();
    expect(plan.notes.some((n) => n.includes("ask around"))).toBe(true);
  });

  it("passes a corroborated shop through to the estimate", () => {
    const plan = buildMarketRunPlan({
      market: MARKET,
      sections: SECTIONS,
      guides: [],
      items: [{ category: "fashion" }],
      budgetMax: null,
      intelByCategory: new Map([
        ["fashion", intel({ basis: "corroborated", corroboratedShopId: "shop-7" })],
      ]),
    });
    const est = plan.stops[0].estimates[0];
    expect(est.basis).toBe("corroborated");
    expect(est.corroboratedShopId).toBe("shop-7");
  });
});

describe("buildMarketRunPlan - routing", () => {
  it("routes each category to the lane that specializes in it", () => {
    const plan = buildMarketRunPlan({
      market: MARKET,
      sections: SECTIONS,
      guides: [],
      items: [{ category: "fashion" }, { category: "ethnic" }],
      budgetMax: null,
      intelByCategory: new Map([
        ["fashion", intel({})],
        ["ethnic", intel({})],
      ]),
    });
    const fashionStop = plan.stops.find((s) => s.section === "Export back-lane");
    const ethnicStop = plan.stops.find((s) => s.section === "Ethnic block");
    expect(fashionStop?.estimates[0].category).toBe("fashion");
    expect(ethnicStop?.estimates[0].category).toBe("ethnic");
  });

  it("puts categories with no matching lane in a general stop, ordered last", () => {
    const plan = buildMarketRunPlan({
      market: MARKET,
      sections: SECTIONS,
      guides: [],
      items: [{ category: "fashion" }, { category: "electronics" }],
      budgetMax: null,
      intelByCategory: new Map([
        ["fashion", intel({})],
        ["electronics", intel({})],
      ]),
    });
    expect(plan.stops[plan.stops.length - 1].section).toBeNull();
  });

  it("de-dupes repeated categories into one estimate", () => {
    const plan = buildMarketRunPlan({
      market: MARKET,
      sections: SECTIONS,
      guides: [],
      items: [
        { category: "fashion", item: "jacket" },
        { category: "fashion", item: "cargos" },
      ],
      budgetMax: null,
      intelByCategory: new Map([["fashion", intel({})]]),
    });
    const all = plan.stops.flatMap((s) => s.estimates);
    expect(all).toHaveLength(1);
  });
});

describe("buildMarketRunPlan - budget", () => {
  const twoItems = {
    market: MARKET,
    sections: SECTIONS,
    guides: [],
    items: [{ category: "fashion" }, { category: "ethnic" }],
    intelByCategory: new Map([
      ["fashion", intel({ band: { low: 300, high: 500 } })],
      ["ethnic", intel({ band: { low: 400, high: 700 } })],
    ]),
  };

  it("sums bands and calls it feasible when the high end fits", () => {
    const plan = buildMarketRunPlan({ ...twoItems, budgetMax: 1500 });
    expect(plan.estimatedLow).toBe(700);
    expect(plan.estimatedHigh).toBe(1200);
    expect(plan.budgetVerdict).toBe("feasible");
  });

  it("calls it tight when only the low end fits", () => {
    const plan = buildMarketRunPlan({ ...twoItems, budgetMax: 900 });
    expect(plan.budgetVerdict).toBe("tight");
    expect(plan.notes.some((n) => n.includes("bargain"))).toBe(true);
  });

  it("calls it over when even the low end busts the budget", () => {
    const plan = buildMarketRunPlan({ ...twoItems, budgetMax: 500 });
    expect(plan.budgetVerdict).toBe("over");
    expect(plan.notes.some((n) => n.includes("over your budget"))).toBe(true);
  });

  it("is unknown when there is no budget or no priced items", () => {
    expect(buildMarketRunPlan({ ...twoItems, budgetMax: null }).budgetVerdict).toBe(
      "unknown",
    );
    const noPrices = buildMarketRunPlan({
      market: MARKET,
      sections: SECTIONS,
      guides: [],
      items: [{ category: "fashion" }],
      budgetMax: 1000,
      intelByCategory: new Map([["fashion", intel({ basis: "insufficient", band: null })]]),
    });
    expect(noPrices.estimatedHigh).toBeNull();
    expect(noPrices.budgetVerdict).toBe("unknown");
  });
});
