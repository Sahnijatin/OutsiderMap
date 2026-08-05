import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicMediaUrl } from "@/lib/media/url";
import {
  FEED_PAGE_SIZE,
  rankDiscover,
  type FeedTab,
  type PostAuthor,
  type PostCard,
} from "./read";
import { resolvePostLocation } from "./location";

/**
 * The one feed-page fetcher, shared by the server-rendered /feed page and the
 * /api/feed route (pagination + the mobile app). Both callers hand in an
 * RLS-scoped Supabase client, so visibility (can_view_post) is enforced the
 * same way on every path.
 *
 *  - home: reverse-chronological posts from people you follow (+ you)
 *  - discover: public approved posts, re-ranked by a light Discover score
 *
 * Keyset-paginated by created_at. The cursor is derived from DB order (the
 * oldest row in the raw page), before block filtering or Discover re-ordering,
 * so pagination stays correct even when rows are dropped or re-ranked.
 */

export type FeedPage = { posts: PostCard[]; nextCursor: string | null };

/** Thrown when the underlying query fails - callers decide how to surface it. */
export class FeedQueryError extends Error {}

/**
 * The columns a feed card needs. Exported so the single-post page selects the
 * identical shape instead of re-declaring it and drifting.
 *
 * `article` is the long-form child (migration 0056); it is null for every
 * other post type.
 *
 * The place embed MUST name `posts_place_id_fkey` explicitly. Migration 0056
 * added post_article_places(post_id, place_id) with both columns as the
 * composite primary key - which is exactly PostgREST's definition of a junction
 * table, so it infers a second, many-to-many posts<->places relationship
 * through it. With two candidate paths an unqualified `place:places(...)` is
 * ambiguous and the whole query fails with PGRST201, taking the feed down.
 * Naming the foreign key pins it to the direct posts.place_id path.
 */
export const CARD_FIELDS =
  "id, author_id, type, place_id, area, city, location_precision, action, mood, body, visibility, status, like_count, comment_count, want_count, created_at, place:places!posts_place_id_fkey(id, slug, name, area), article:post_articles(title, slug, reading_minutes)";

/** followees + self - the "home" author set. */
async function networkAuthorIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const { data: follows } = await supabase
    .from("follows")
    .select("followee")
    .eq("follower", userId);
  const ids = new Set<string>([userId]);
  for (const f of follows ?? []) ids.add(f.followee);
  return [...ids];
}

export async function fetchFeedPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  tab: FeedTab,
  cursor?: string,
): Promise<FeedPage> {
  const [network, { data: hiddenRows }] = await Promise.all([
    networkAuthorIds(supabase, userId).then((ids) => new Set(ids)),
    supabase.rpc("hidden_user_ids"),
  ]);
  const hidden = new Set<string>((hiddenRows as string[] | null) ?? []);

  let query = supabase
    .from("posts")
    .select(CARD_FIELDS)
    .eq("status", "approved")
    // A blog the author scoped to its place page never enters the feed.
    // Everything else defaults true, so no existing post is affected.
    .eq("show_in_feed", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(FEED_PAGE_SIZE + 1);
  if (tab === "home") {
    query = query.in("author_id", [...network]);
  } else {
    query = query.eq("visibility", "public");
  }
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: rows, error } = await query;
  if (error) {
    throw new FeedQueryError(error.message);
  }

  const hasMore = (rows?.length ?? 0) > FEED_PAGE_SIZE;
  // The DB page drives the keyset cursor; the displayed page drops anyone in a
  // block relationship with the caller (either direction).
  const dbPage = (rows ?? []).slice(0, FEED_PAGE_SIZE);
  const page = dbPage.filter((r) => !hidden.has(r.author_id));
  const nextCursor =
    hasMore && dbPage.length > 0 ? dbPage[dbPage.length - 1].created_at : null;

  if (page.length === 0) {
    return { posts: [], nextCursor };
  }

  // Author identities + first media, both batched for the page.
  const authorIds = [...new Set(page.map((p) => p.author_id))];
  const postIds = page.map((p) => p.id);
  const [{ data: authors }, { data: media }] = await Promise.all([
    supabase.rpc("public_authors", { ids: authorIds }),
    supabase
      .from("post_media")
      .select("post_id, kind, path, poster_path, ordinal, bucket")
      .in("post_id", postIds)
      .order("ordinal"),
  ]);

  const authorById = new Map<string, PostAuthor>(
    (authors ?? []).map((a) => [a.id, a]),
  );
  const mediaByPost = new Map<string, PostCard["media"]>();
  for (const m of media ?? []) {
    const list = mediaByPost.get(m.post_id) ?? [];
    list.push({
      kind: m.kind,
      url: publicMediaUrl(m.bucket, m.path),
      posterUrl: publicMediaUrl(m.bucket, m.poster_path),
    });
    mediaByPost.set(m.post_id, list);
  }

  const cards: PostCard[] = page.map((p) => {
    // Coarsen the location server-side before it ships (#122): the exact place
    // never reaches the client for a post the author kept coarse.
    const loc = resolvePostLocation(
      p.location_precision,
      p.place ?? null,
      p.area,
    );
    return {
      id: p.id,
      author_id: p.author_id,
      type: p.type,
      place: loc.place,
      area: loc.area,
      city: p.city,
      location_precision: p.location_precision,
      action: p.action,
      mood: p.mood,
      body: p.body,
      visibility: p.visibility,
      created_at: p.created_at,
      like_count: p.like_count,
      comment_count: p.comment_count,
      want_count: p.want_count,
      author: authorById.get(p.author_id) ?? null,
      media: mediaByPost.get(p.id) ?? [],
      article: p.article ?? null,
      fromNetwork: network.has(p.author_id),
    };
  });

  const posts = tab === "discover" ? rankDiscover(cards, Date.now()) : cards;

  return { posts, nextCursor };
}
