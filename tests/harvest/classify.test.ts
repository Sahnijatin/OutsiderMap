import { describe, expect, it } from "vitest";
import {
  GOOGLE_TYPE_MAP,
  OSM_TAG_MAP,
  PRODUCT_CATEGORY_SLUGS,
  classifyInbound,
  productCategoryForKind,
} from "@/lib/catalog/classify";

const PLACE_KINDS = new Set([
  "spot", "cafe", "nightlife", "workshop", "historical", "cultural", "event",
]);

describe("classifyInbound", () => {
  it("lets type evidence outrank the sweep prior", () => {
    const c = classifyInbound({
      googlePrimaryType: "bar",
      prior: { productCategory: "food", kind: "spot" },
    });
    expect(c.productCategory).toBe("nightlife");
    expect(c.kind).toBe("nightlife");
    expect(c.matchedSignal).toBe("google:primaryType=bar");
  });

  it("funnels cuisine-specific restaurant types to food/spot", () => {
    const c = classifyInbound({ googlePrimaryType: "south_indian_restaurant" });
    expect(c.productCategory).toBe("food");
    expect(c.kind).toBe("spot");
  });

  it("collects every distinct group, primary first", () => {
    const c = classifyInbound({
      googlePrimaryType: "restaurant",
      googleTypes: ["restaurant", "park"],
    });
    expect(c.productCategory).toBe("food");
    expect(c.categories).toEqual(["food", "outdoors"]);
  });

  it("classifies OSM tags by key priority", () => {
    expect(classifyInbound({ osmTags: { leisure: "park" } }).productCategory).toBe("outdoors");
    expect(classifyInbound({ osmTags: { historic: "fort" } }).kind).toBe("historical");
    expect(classifyInbound({ osmTags: { tourism: "viewpoint" } }).productCategory).toBe("outdoors");
    // amenity wins over historic when both are present
    const both = classifyInbound({ osmTags: { amenity: "cafe", historic: "fort" } });
    expect(both.productCategory).toBe("food");
    expect(both.categories).toEqual(["food", "culture"]);
  });

  it("falls back to the prior, then food/spot", () => {
    const prior = classifyInbound({
      osmTags: { historic: "yes" },
      prior: { productCategory: "outdoors", kind: "spot" },
    });
    expect(prior.productCategory).toBe("outdoors");
    expect(prior.matchedSignal).toBeNull();

    const bare = classifyInbound({});
    expect(bare.productCategory).toBe("food");
    expect(bare.kind).toBe("spot");
  });

  it("keeps both mapping tables inside the product vocabulary", () => {
    for (const [type, t] of Object.entries(GOOGLE_TYPE_MAP)) {
      expect(PRODUCT_CATEGORY_SLUGS, type).toContain(t.productCategory);
      expect(PLACE_KINDS.has(t.kind), `${type} -> ${t.kind}`).toBe(true);
    }
    for (const [key, values] of Object.entries(OSM_TAG_MAP)) {
      for (const [value, t] of Object.entries(values)) {
        expect(PRODUCT_CATEGORY_SLUGS, `${key}=${value}`).toContain(t.productCategory);
        expect(PLACE_KINDS.has(t.kind), `${key}=${value} -> ${t.kind}`).toBe(true);
      }
    }
  });
});

describe("productCategoryForKind", () => {
  it("maps kinds to groups, spot to null", () => {
    expect(productCategoryForKind("cafe")).toBe("food");
    expect(productCategoryForKind("nightlife")).toBe("nightlife");
    expect(productCategoryForKind("historical")).toBe("culture");
    expect(productCategoryForKind("spot")).toBeNull();
  });
});
