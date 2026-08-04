import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Blogs attached to a place, for the place page's "Stories" section.
 *
 * A blog reaches a place two ways: as the anchor (`posts.place_id`) or as one
 * of the extra places a roundup tags (`post_article_places`). PostgREST can't
 * express that as one OR across a child table, so this runs both and merges.
 *
 * Called with an RLS-scoped client, so an anonymous reader gets nothing at all
 * (can_view_post requires a session) and the caller must render the section
 * only when rows actually come back.
 */

export type PlaceArticle = {
  slug: string;
  title: string;
  readingMinutes: number | null;
  createdAt: string;
  authorId: string;
};

type ArticleJoin = {
  title: string;
  slug: string;
  reading_minutes: number | null;
};

/** Newest first, so a place's page leads with the most recent writing. */
function byNewest(a: PlaceArticle, b: PlaceArticle): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export async function listPlaceArticles(
  supabase: SupabaseClient<Database>,
  placeId: string,
  limit = 6,
): Promise<PlaceArticle[]> {
  const [anchored, tagged] = await Promise.all([
    supabase
      .from("posts")
      .select("id, author_id, created_at, article:post_articles(title, slug, reading_minutes)")
      .eq("type", "article")
      .eq("status", "approved")
      .eq("place_id", placeId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("post_article_places")
      .select(
        "post:posts(id, author_id, created_at, status, type, article:post_articles(title, slug, reading_minutes))",
      )
      .eq("place_id", placeId)
      .order("sort_order")
      .limit(limit),
  ]);

  const byId = new Map<string, PlaceArticle>();

  for (const row of anchored.data ?? []) {
    const article = row.article as ArticleJoin | null;
    if (!article) continue;
    byId.set(row.id, {
      slug: article.slug,
      title: article.title,
      readingMinutes: article.reading_minutes,
      createdAt: row.created_at,
      authorId: row.author_id,
    });
  }

  for (const row of tagged.data ?? []) {
    const post = row.post;
    if (!post || post.status !== "approved" || post.type !== "article") continue;
    const article = post.article as ArticleJoin | null;
    if (!article || byId.has(post.id)) continue;
    byId.set(post.id, {
      slug: article.slug,
      title: article.title,
      readingMinutes: article.reading_minutes,
      createdAt: post.created_at,
      authorId: post.author_id,
    });
  }

  return [...byId.values()].sort(byNewest).slice(0, limit);
}
