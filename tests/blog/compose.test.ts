import { describe, expect, it } from "vitest";
import {
  CreateArticleSchema,
  MAX_ARTICLE_EXTRA_PLACES,
  normalizeExtraPlaceIds,
} from "@/lib/blog/compose";

const PLACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PLACE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THIRD_PLACE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const valid = {
  type: "article",
  title: "Seven cafes in Hauz Khas",
  body: [{ type: "paragraph", text: "You walk past it twice." }],
  place_id: PLACE,
};

describe("CreateArticleSchema", () => {
  it("accepts a minimal blog and defaults the surfacing choice to off", () => {
    const parsed = CreateArticleSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    // Safe by default: a blog never enters the feed unless asked.
    expect(parsed.success && parsed.data.show_in_feed).toBe(false);
    expect(parsed.success && parsed.data.visibility).toBe("public");
    expect(parsed.success && parsed.data.extra_place_ids).toEqual([]);
  });

  it("requires an anchor place - a blog is written about somewhere", () => {
    const withoutPlace = { ...valid, place_id: undefined };
    expect(CreateArticleSchema.safeParse(withoutPlace).success).toBe(false);
    expect(
      CreateArticleSchema.safeParse({ ...valid, place_id: "hauz-khas" }).success,
    ).toBe(false);
  });

  it("requires a title", () => {
    expect(CreateArticleSchema.safeParse({ ...valid, title: "  " }).success).toBe(
      false,
    );
  });

  it("requires a non-empty body", () => {
    expect(CreateArticleSchema.safeParse({ ...valid, body: [] }).success).toBe(
      false,
    );
  });

  it("carries the surfacing choice through when set", () => {
    const parsed = CreateArticleSchema.safeParse({ ...valid, show_in_feed: true });
    expect(parsed.success && parsed.data.show_in_feed).toBe(true);
  });

  it("accepts extra places and caps how many", () => {
    expect(
      CreateArticleSchema.safeParse({
        ...valid,
        extra_place_ids: [OTHER_PLACE, THIRD_PLACE],
      }).success,
    ).toBe(true);

    const tooMany = Array.from({ length: MAX_ARTICLE_EXTRA_PLACES + 1 }, () => OTHER_PLACE);
    expect(
      CreateArticleSchema.safeParse({ ...valid, extra_place_ids: tooMany }).success,
    ).toBe(false);
  });

  it("rejects a non-article type - this schema is article-only", () => {
    expect(CreateArticleSchema.safeParse({ ...valid, type: "status" }).success).toBe(
      false,
    );
  });
});

describe("normalizeExtraPlaceIds", () => {
  it("drops the anchor so a place page cannot list the blog twice", () => {
    expect(normalizeExtraPlaceIds(PLACE, [PLACE, OTHER_PLACE])).toEqual([
      OTHER_PLACE,
    ]);
  });

  it("de-duplicates while preserving order", () => {
    expect(
      normalizeExtraPlaceIds(PLACE, [THIRD_PLACE, OTHER_PLACE, THIRD_PLACE]),
    ).toEqual([THIRD_PLACE, OTHER_PLACE]);
  });

  it("returns empty when the only extra is the anchor", () => {
    expect(normalizeExtraPlaceIds(PLACE, [PLACE])).toEqual([]);
  });
});
