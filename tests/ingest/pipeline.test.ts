import { describe, expect, it } from "vitest";
import { CandidateSchema, detectSourceType } from "@/lib/ingest/pipeline";

describe("detectSourceType", () => {
  it.each([
    ["https://www.instagram.com/reel/abc/", "instagram"],
    ["https://instagram.com/p/xyz", "instagram"],
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://someblog.in/hidden-gems-delhi", "blog"],
    ["https://maps.app.goo.gl/AbCdEf", "maps"],
    ["https://www.google.com/maps/place/Cafe+Lota/@28.61,77.24,17z", "maps"],
    ["member://submission/uuid-1", "member"],
    ["not a url", "other"],
  ])("%s -> %s", (url, expected) => {
    expect(detectSourceType(url)).toBe(expected);
  });
});

describe("CandidateSchema", () => {
  const valid = {
    name: "Karim's",
    city: "delhi",
    area: "Old Delhi",
    kind: "spot",
    category: "street food",
    price_hint: 2,
    vibe_tags: ["greasy", "historic"],
    why_special: "The mutton korma survived a century for a reason.",
    description: "A Jama Masjid institution.",
    confidence: "high",
  };

  it("accepts a complete candidate", () => {
    expect(CandidateSchema.parse(valid).name).toBe("Karim's");
  });

  it("bounds price and vibe tags", () => {
    expect(() =>
      CandidateSchema.parse({ ...valid, price_hint: 9 }),
    ).toThrow();
    expect(() =>
      CandidateSchema.parse({
        ...valid,
        vibe_tags: Array.from({ length: 9 }, (_, i) => `v${i}`),
      }),
    ).toThrow();
  });

  it("rejects unknown kinds and confidences", () => {
    expect(() => CandidateSchema.parse({ ...valid, kind: "mall" })).toThrow();
    expect(() =>
      CandidateSchema.parse({ ...valid, confidence: "certain" }),
    ).toThrow();
  });
});
