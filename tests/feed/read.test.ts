import { describe, expect, it } from "vitest";
import {
  discoverScore,
  FeedQuerySchema,
  rankDiscover,
  type PostCard,
} from "@/lib/feed/read";

const NOW = Date.parse("2026-07-22T12:00:00.000Z");

function card(over: Partial<PostCard>): PostCard {
  return {
    id: "p",
    author_id: "a",
    type: "status",
    place: null,
    area: null,
    city: "delhi",
    action: null,
    mood: null,
    body: null,
    visibility: "public",
    created_at: "2026-07-22T12:00:00.000Z",
    like_count: 0,
    comment_count: 0,
    want_count: 0,
    author: null,
    media: [],
    fromNetwork: false,
    ...over,
  };
}

describe("FeedQuerySchema", () => {
  it("defaults tab to home and accepts a valid cursor", () => {
    expect(FeedQuerySchema.parse({}).tab).toBe("home");
    expect(
      FeedQuerySchema.safeParse({ tab: "discover", cursor: "2026-07-22T12:00:00.000Z" }).success,
    ).toBe(true);
  });

  it("rejects an unknown tab or a non-datetime cursor", () => {
    expect(FeedQuerySchema.safeParse({ tab: "trending" }).success).toBe(false);
    expect(FeedQuerySchema.safeParse({ cursor: "yesterday" }).success).toBe(false);
  });
});

describe("discoverScore", () => {
  it("counts want_to_go double a like and adds comments", () => {
    const base = card({ like_count: 1, want_count: 1, comment_count: 1 });
    // engagement = 1 + 2 + 1 = 4, age 0, no boost
    expect(discoverScore(base, NOW)).toBeCloseTo(4);
  });

  it("gives a network post a fixed boost over an identical non-network one", () => {
    const net = card({ fromNetwork: true });
    const not = card({ fromNetwork: false });
    expect(discoverScore(net, NOW) - discoverScore(not, NOW)).toBeCloseTo(5);
  });

  it("decays with age", () => {
    const fresh = card({ created_at: "2026-07-22T12:00:00.000Z" });
    const old = card({ created_at: "2026-07-22T02:00:00.000Z" }); // 10h older
    expect(discoverScore(fresh, NOW)).toBeGreaterThan(discoverScore(old, NOW));
  });
});

describe("rankDiscover", () => {
  it("orders by score, network + engagement rising to the top", () => {
    const cards = [
      card({ id: "quiet", like_count: 0 }),
      card({ id: "hot", like_count: 20 }),
      card({ id: "friend", fromNetwork: true }),
    ];
    const ranked = rankDiscover(cards, NOW).map((c) => c.id);
    expect(ranked[0]).toBe("hot");
    expect(ranked).toContain("friend");
    expect(ranked[2]).toBe("quiet");
  });

  it("is stable for equal scores and does not mutate the input", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    const ranked = rankDiscover(cards, NOW).map((c) => c.id);
    expect(ranked).toEqual(["a", "b"]);
    expect(cards.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
