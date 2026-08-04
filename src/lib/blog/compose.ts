import { z } from "zod";
import { POST_VISIBILITIES } from "@/lib/feed/model";
import { ArticleBodySchema, MAX_ARTICLE_TITLE } from "./blocks";

/**
 * Create/edit contracts for member blogs, shared by the composer and
 * /api/posts. Pure, so client and server validate identically.
 *
 * A blog is a post with `type: 'article'`, so everything here layers on top of
 * the post contract rather than replacing it. Two article-specific rules:
 *
 * - `place_id` is REQUIRED. A blog is written *about* a place; the anchor is
 *   what the feed card shows and where "open the blog and the place" lands.
 *   Ordinary posts may float without one, articles may not.
 * - `show_in_feed` is the member's surfacing choice - false keeps the blog on
 *   its place page only. It defaults to false so a blog never enters the feed
 *   by accident; the composer asks explicitly.
 */

/** Extra places a roundup mentions, beyond the anchor. */
export const MAX_ARTICLE_EXTRA_PLACES = 20;

export const CreateArticleSchema = z.object({
  type: z.literal("article"),
  title: z.string().trim().min(1, "Give the blog a title.").max(MAX_ARTICLE_TITLE),
  body: ArticleBodySchema,
  place_id: z.string().uuid("A blog needs a place it is about."),
  extra_place_ids: z
    .array(z.string().uuid())
    .max(MAX_ARTICLE_EXTRA_PLACES)
    .default([]),
  city: z.string().trim().min(1).max(60).optional(),
  show_in_feed: z.boolean().default(false),
  visibility: z.enum(POST_VISIBILITIES).default("public"),
});

export type CreateArticleInput = z.infer<typeof CreateArticleSchema>;

/**
 * The anchor is stored on posts.place_id and must not be duplicated into
 * post_article_places, or the place page would list the blog twice.
 */
export function normalizeExtraPlaceIds(
  anchorId: string,
  extras: string[],
): string[] {
  const seen = new Set<string>([anchorId]);
  const out: string[] = [];
  for (const id of extras) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
