import { describe, expect, it } from "vitest";
import {
  ArticleBodySchema,
  articlePlainText,
  articleSlug,
  MAX_ARTICLE_BLOCKS,
  parseArticleBody,
  readingMinutes,
  referencedPlaceIds,
  slugifyTitle,
  type ArticleBlock,
} from "@/lib/blog/blocks";

const PLACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PLACE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ArticleBodySchema", () => {
  it("accepts every block type", () => {
    const body = [
      { type: "heading", text: "The back room" },
      { type: "paragraph", text: "You walk past it twice before you find it." },
      { type: "quote", text: "We don't advertise." },
      { type: "place", place_id: PLACE, note: "Order the filter coffee." },
    ];
    expect(ArticleBodySchema.safeParse(body).success).toBe(true);
  });

  it("allows a place block without a note", () => {
    const parsed = ArticleBodySchema.safeParse([{ type: "place", place_id: PLACE }]);
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown block type", () => {
    const parsed = ArticleBodySchema.safeParse([
      { type: "image", media_path: "x.jpg" },
    ]);
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty body - a blog has to say something", () => {
    expect(ArticleBodySchema.safeParse([]).success).toBe(false);
  });

  it("rejects an empty paragraph", () => {
    expect(
      ArticleBodySchema.safeParse([{ type: "paragraph", text: "   " }]).success,
    ).toBe(false);
  });

  it("rejects a place block whose id is not a uuid", () => {
    expect(
      ArticleBodySchema.safeParse([{ type: "place", place_id: "hauz-khas" }])
        .success,
    ).toBe(false);
  });

  it("caps the number of blocks", () => {
    const tooMany = Array.from({ length: MAX_ARTICLE_BLOCKS + 1 }, () => ({
      type: "paragraph",
      text: "a",
    }));
    expect(ArticleBodySchema.safeParse(tooMany).success).toBe(false);
  });
});

describe("parseArticleBody", () => {
  it("drops unreadable blocks instead of throwing", () => {
    const blocks = parseArticleBody([
      { type: "paragraph", text: "kept" },
      { type: "image", media_path: "dropped.jpg" },
      { type: "quote", text: "kept too" },
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "quote"]);
  });

  it.each([[null], [undefined], ["a string"], [42], [{}]])(
    "degrades to an empty article on %s",
    (raw) => {
      expect(parseArticleBody(raw)).toEqual([]);
    },
  );
});

describe("slugifyTitle", () => {
  it("lowercases, strips punctuation and collapses separators", () => {
    expect(slugifyTitle("Seven Cafés in Hauz Khas (Not on Google!)")).toBe(
      "seven-cafes-in-hauz-khas-not-on-google",
    );
  });

  it("never ends in a separator, even when truncation lands on one", () => {
    // 52-char cut falls mid-gap; the trailing dash must not survive.
    const slug = slugifyTitle(`${"a".repeat(52)} tail`);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("falls back rather than returning an empty slug", () => {
    expect(slugifyTitle("!!!")).toBe("blog");
    expect(slugifyTitle("")).toBe("blog");
  });

  it("is deterministic", () => {
    expect(slugifyTitle("Same Title")).toBe(slugifyTitle("Same Title"));
  });
});

describe("articleSlug", () => {
  it("appends the caller's suffix so equal titles do not collide", () => {
    expect(articleSlug("Cafes in Hauz Khas", "k3f9x2")).toBe(
      "cafes-in-hauz-khas-k3f9x2",
    );
    expect(articleSlug("Cafes in Hauz Khas", "k3f9x2")).not.toBe(
      articleSlug("Cafes in Hauz Khas", "z8p1q4"),
    );
  });

  it("sanitizes the suffix", () => {
    expect(articleSlug("Title", "AB-12!")).toBe("title-ab12");
  });

  it("omits the separator when the suffix is empty", () => {
    expect(articleSlug("Title", "")).toBe("title");
  });
});

describe("readingMinutes", () => {
  const paragraph = (words: number): ArticleBlock => ({
    type: "paragraph",
    text: Array.from({ length: words }, () => "word").join(" "),
  });

  it("is at least one minute for a short blog", () => {
    expect(readingMinutes([paragraph(5)])).toBe(1);
  });

  it("rounds up at 200 words per minute", () => {
    expect(readingMinutes([paragraph(200)])).toBe(1);
    expect(readingMinutes([paragraph(201)])).toBe(2);
    expect(readingMinutes([paragraph(600)])).toBe(3);
  });

  it("ignores place blocks, which carry no prose to read", () => {
    const withPlace = readingMinutes([paragraph(200), { type: "place", place_id: PLACE }]);
    expect(withPlace).toBe(1);
  });

  it("returns a minute for a body of only place blocks", () => {
    expect(readingMinutes([{ type: "place", place_id: PLACE }])).toBe(1);
  });
});

describe("articlePlainText", () => {
  // This feeds posts.body, which is the only article text the moderation gate
  // ever sees. Anything missing here ships unscreened.
  it("includes the title and every prose block, in order", () => {
    const text = articlePlainText("The back room", [
      { type: "heading", text: "Getting in" },
      { type: "paragraph", text: "Walk past the shutter." },
      { type: "quote", text: "We don't advertise." },
    ]);
    expect(text).toBe(
      "The back room\n\nGetting in\n\nWalk past the shutter.\n\nWe don't advertise.",
    );
  });

  it("includes a place block's note - it is member-written text too", () => {
    const text = articlePlainText("Title", [
      { type: "place", place_id: PLACE, note: "Order the filter coffee." },
    ]);
    expect(text).toContain("Order the filter coffee.");
  });

  it("skips a place block with no note", () => {
    expect(articlePlainText("Title", [{ type: "place", place_id: PLACE }])).toBe(
      "Title",
    );
  });

  it("never returns only whitespace", () => {
    expect(articlePlainText("  Title  ", [])).toBe("Title");
  });
});

describe("referencedPlaceIds", () => {
  it("collects place blocks and de-duplicates", () => {
    const ids = referencedPlaceIds([
      { type: "place", place_id: PLACE },
      { type: "paragraph", text: "between" },
      { type: "place", place_id: OTHER_PLACE },
      { type: "place", place_id: PLACE },
    ]);
    expect(ids).toEqual([PLACE, OTHER_PLACE]);
  });

  it("is empty for prose-only bodies", () => {
    expect(referencedPlaceIds([{ type: "paragraph", text: "no places" }])).toEqual([]);
  });
});
