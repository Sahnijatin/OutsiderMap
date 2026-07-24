import { describe, expect, it } from "vitest";
import { buildActivationQuery } from "@/lib/now/activation";

describe("buildActivationQuery", () => {
  it("falls back to a neutral ask when there are no taste signals", () => {
    expect(buildActivationQuery(null)).toBe(
      "Somewhere that feels like my kind of place right now.",
    );
    expect(buildActivationQuery({})).toBe(
      "Somewhere that feels like my kind of place right now.",
    );
    expect(buildActivationQuery({ vibe_keywords: [], anchors: [] })).toBe(
      "Somewhere that feels like my kind of place right now.",
    );
  });

  it("weaves in vibe keywords when present", () => {
    const q = buildActivationQuery({ vibe_keywords: ["dim", "vinyl", "quiet"] });
    expect(q).toContain("dim, vinyl, quiet");
    expect(q.startsWith("Somewhere that feels like me")).toBe(true);
  });

  it("weaves in anchors when present", () => {
    const q = buildActivationQuery({ anchors: ["Blue Tokai", "Depot 48"] });
    expect(q).toContain("in the spirit of Blue Tokai and Depot 48");
  });

  it("caps vibes at four and anchors at two so the ask stays tight", () => {
    const q = buildActivationQuery({
      vibe_keywords: ["a", "b", "c", "d", "e", "f"],
      anchors: ["x", "y", "z"],
    });
    expect(q).toContain("a, b, c, d");
    expect(q).not.toContain(", e");
    expect(q).toContain("x and y");
    expect(q).not.toContain("and z");
  });

  it("always returns a non-empty ask (recommend requires one)", () => {
    for (const d of [null, {}, { vibe_keywords: ["x"] }, { anchors: ["y"] }]) {
      expect(buildActivationQuery(d).length).toBeGreaterThan(0);
    }
  });
});
