import { z } from "zod";
import type { PostType, PostVisibility } from "./model";

/**
 * Feed read model: the query contract and the (pure) Discover ranking. Home is
 * plain reverse-chronology of your network; Discover re-orders a recency
 * window by a light score. This scoring is deliberately standalone - it never
 * touches match_places or its `obviousness` penalty, so the feed's friend
 * boost stays separate from place-ranking, per the epic.
 */

export const FEED_TABS = ["home", "discover"] as const;
export type FeedTab = (typeof FEED_TABS)[number];

export const FeedQuerySchema = z.object({
  tab: z.enum(FEED_TABS).default("home"),
  // Keyset cursor: the created_at of the last card seen (matches the reels
  // feed). The client dedupes by id, so a microsecond tie can't double-show.
  cursor: z.string().datetime({ offset: true }).optional(),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FEED_PAGE_SIZE = 12;

export type PostAuthor = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  outsider_number: number | null;
};

export type PostMediaCard = {
  kind: "image" | "video";
  url: string | null;
  posterUrl: string | null;
};

export type PostPlace = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
} | null;

export type PostCard = {
  id: string;
  author_id: string;
  type: PostType;
  place: PostPlace;
  area: string | null;
  city: string;
  action: string | null;
  mood: string | null;
  body: string | null;
  visibility: PostVisibility;
  created_at: string;
  like_count: number;
  comment_count: number;
  want_count: number;
  author: PostAuthor | null;
  media: PostMediaCard[];
  fromNetwork: boolean;
};

// Discover scoring weights. Engagement + a network boost, decayed by age. A
// want_to_go signals intent, so it counts double a like.
const WANT_WEIGHT = 2;
const NETWORK_BOOST = 5;
const RECENCY_DECAY_PER_HOUR = 0.15;

export function discoverScore(
  card: Pick<
    PostCard,
    "like_count" | "want_count" | "comment_count" | "created_at" | "fromNetwork"
  >,
  nowMs: number,
): number {
  const engagement =
    card.like_count + card.want_count * WANT_WEIGHT + card.comment_count;
  const ageHours = Math.max(
    0,
    (nowMs - new Date(card.created_at).getTime()) / 3_600_000,
  );
  const boost = card.fromNetwork ? NETWORK_BOOST : 0;
  return engagement + boost - ageHours * RECENCY_DECAY_PER_HOUR;
}

/**
 * Re-order a page of cards for Discover by descending score. Pure and stable:
 * equal scores keep their incoming (recency) order. Does not mutate the input,
 * and does not affect keyset pagination (the caller derives the cursor from
 * the DB order, not this display order).
 */
export function rankDiscover(cards: PostCard[], nowMs: number): PostCard[] {
  return cards
    .map((card, index) => ({ card, index, score: discoverScore(card, nowMs) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.card);
}
