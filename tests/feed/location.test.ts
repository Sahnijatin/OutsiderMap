import { describe, expect, it } from "vitest";
import { resolvePostLocation } from "@/lib/feed/location";

const place = { id: "p1", slug: "the-spot", name: "The Spot", area: "Hauz Khas" };

describe("resolvePostLocation (#122)", () => {
  it("exact: keeps the pinned place and its area", () => {
    expect(resolvePostLocation("exact", place, null)).toEqual({
      place,
      area: "Hauz Khas",
    });
  });

  it("area: drops the exact place, keeps only the neighbourhood", () => {
    const r = resolvePostLocation("area", place, null);
    expect(r.place).toBeNull();
    expect(r.area).toBe("Hauz Khas");
  });

  it("hidden: reveals neither place nor area", () => {
    expect(resolvePostLocation("hidden", place, "Hauz Khas")).toEqual({
      place: null,
      area: null,
    });
  });

  it("area: never leaks the exact place identity to the client", () => {
    const r = resolvePostLocation("area", place, null);
    // The slug/name are how the exact venue would be reached (/place/[slug]).
    expect(JSON.stringify(r)).not.toContain("the-spot");
    expect(JSON.stringify(r)).not.toContain("The Spot");
  });

  it("prefers the post's own area text over the place's area", () => {
    expect(resolvePostLocation("area", place, "Saket").area).toBe("Saket");
  });

  it("handles a post with no linked place", () => {
    expect(resolvePostLocation("exact", null, "Saket")).toEqual({
      place: null,
      area: "Saket",
    });
    expect(resolvePostLocation("area", null, null)).toEqual({
      place: null,
      area: null,
    });
  });
});
