import { describe, expect, it } from "vitest";
import {
  combineEmbeddings,
  parseStoredEmbedding,
  preferOpen,
  type CatalogCandidate,
} from "@/lib/catalog/search";

describe("combineEmbeddings", () => {
  it("returns the query untouched when there is no taste vector", () => {
    expect(combineEmbeddings([1, 0], null)).toEqual([1, 0]);
  });

  it("returns the query when dimensions mismatch", () => {
    expect(combineEmbeddings([1, 0], [1])).toEqual([1, 0]);
  });

  it("blends and re-normalizes to unit length", () => {
    const out = combineEmbeddings([1, 0], [0, 1]);
    const norm = Math.hypot(...out);
    expect(norm).toBeCloseTo(1, 6);
    // Query weight 0.65 dominates the taste side.
    expect(out[0]).toBeGreaterThan(out[1]);
  });

  it("guards the degenerate zero-vector case", () => {
    // Blend that cancels to zero must fall back to the raw query, never NaN.
    const out = combineEmbeddings([0.35, 0], [-0.65, 0]);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
    expect(out).toEqual([0.35, 0]);
  });
});

describe("parseStoredEmbedding", () => {
  it("parses a JSON-stringified number array", () => {
    expect(parseStoredEmbedding("[0.1, 0.2]")).toEqual([0.1, 0.2]);
  });

  it.each([
    ["not a string", 42],
    ["corrupt json", "[0.1,"],
    ["empty array", "[]"],
    ["non-numeric entries", '["a"]'],
    ["non-finite entries", "[null]"],
  ])("degrades to null on %s", (_label, raw) => {
    expect(parseStoredEmbedding(raw as never)).toBeNull();
  });
});

function candidate(open: boolean | null): CatalogCandidate {
  return {
    id: "x",
    slug: "x",
    name: "X",
    area: null,
    category: null,
    price_level: null,
    vibe_tags: [],
    description: null,
    editor_note: null,
    similarity: 0.9,
    hours: null,
    image_path: null,
    open,
    openLabel: null,
  };
}

describe("preferOpen", () => {
  it("drops closed places when enough open ones remain", () => {
    const pool = [
      ...Array.from({ length: 6 }, () => candidate(true)),
      candidate(false),
    ];
    expect(preferOpen(pool)).toHaveLength(6);
  });

  it("keeps closed places when the open pool is too thin", () => {
    const pool = [candidate(true), candidate(false), candidate(null)];
    expect(preferOpen(pool)).toHaveLength(3);
  });
});
