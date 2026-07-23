import { describe, expect, it } from "vitest";
import { reportToPricePoint } from "@/lib/market/report";

const NOW = new Date("2026-07-22T00:00:00Z");
const ctx = { marketId: "m1", userId: "u1", now: NOW };

describe("reportToPricePoint", () => {
  it("stages a fresh, first-party, shopless pending row", () => {
    const row = reportToPricePoint({ category: "fashion", item: "jacket", price: 600 }, ctx);
    expect(row).not.toBeNull();
    expect(row!.source).toBe("user_report");
    expect(row!.status).toBe("pending"); // moderated before it counts
    expect(row!.shop_id).toBeNull(); // a report never names a shop
    expect(row!.market_id).toBe("m1");
    expect(row!.observed_at).toBe(NOW.toISOString()); // they just went
    expect(row!.source_ref).toBe("report:u1");
  });

  it("rounds a fractional price to whole rupees", () => {
    const row = reportToPricePoint({ category: "fashion", price: 599.5 }, ctx);
    expect(row!.price).toBe(600);
  });

  it("drops a line with no usable price", () => {
    expect(reportToPricePoint({ category: "fashion", price: 0 }, ctx)).toBeNull();
    expect(reportToPricePoint({ category: "fashion", price: -50 }, ctx)).toBeNull();
    expect(reportToPricePoint({ category: "fashion", price: Number.NaN }, ctx)).toBeNull();
  });
});
