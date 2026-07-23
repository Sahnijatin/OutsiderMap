import { describe, expect, it } from "vitest";
import {
  buildCategoryIndex,
  resolveCategory,
  categoryLabel,
  FALLBACK_CATEGORY_COLOR,
  type MapCategory,
} from "@/lib/map/categories";

const CATEGORIES: MapCategory[] = [
  { id: "id-food", slug: "food", label: "Cafés & restaurants", color: "#f0a431", sortOrder: 1 },
  { id: "id-night", slug: "nightlife", label: "Bars & nightlife", color: "#f2749e", sortOrder: 2 },
];

const index = buildCategoryIndex(CATEGORIES);

describe("resolveCategory", () => {
  it("prefers the category_id FK", () => {
    expect(resolveCategory(index, { categoryId: "id-night" })).toEqual({
      color: "#f2749e",
      label: "Bars & nightlife",
    });
  });

  it("falls back to the legacy category slug, then kind", () => {
    expect(resolveCategory(index, { category: "food" }).color).toBe("#f0a431");
    expect(resolveCategory(index, { kind: "nightlife" }).color).toBe("#f2749e");
  });

  it("uses the amber default when nothing resolves", () => {
    const r = resolveCategory(index, { categoryId: "missing", category: "unknown" });
    expect(r.color).toBe(FALLBACK_CATEGORY_COLOR);
    expect(r.label).toBe("Unknown"); // title-cased fallback from the raw token
  });

  it("ignores a stale category_id and still resolves by slug", () => {
    expect(resolveCategory(index, { categoryId: "gone", category: "food" }).color).toBe(
      "#f0a431",
    );
  });
});

describe("categoryLabel", () => {
  it("title-cases hyphenated tokens", () => {
    expect(categoryLabel("street-food")).toBe("Street food");
    expect(categoryLabel(null)).toBeNull();
  });
});
