import { z } from "zod";

/**
 * Blog body format + the pure helpers around it, shared by the compose UI, the
 * /api/posts write path and the reader. No IO and no server imports, so it
 * unit-tests cleanly and client and server agree on what a valid body is.
 *
 * The body is an ordered array of typed blocks rather than markdown or HTML.
 * Three reasons, in order of importance: rendering never needs
 * dangerouslySetInnerHTML (there are zero uses in this codebase and that should
 * stay true); a `place` block can render a live place card mid-article, which
 * is the whole point of a blog attached to the catalog; and it adds no
 * dependency to parse or sanitize.
 *
 * Images are deliberately not a block type in v1. Photos attach through the
 * existing post_media path (signed upload -> confirm -> moderatePost) so they
 * inherit image moderation instead of needing a second review path.
 */

export const MAX_ARTICLE_TITLE = 200;
export const MAX_ARTICLE_PARAGRAPH = 4000;
export const MAX_ARTICLE_HEADING = 200;
export const MAX_ARTICLE_QUOTE = 1000;
export const MAX_ARTICLE_NOTE = 280;
export const MAX_ARTICLE_BLOCKS = 200;

export const ARTICLE_BLOCK_TYPES = [
  "paragraph",
  "heading",
  "quote",
  "place",
] as const;

export type ArticleBlockType = (typeof ARTICLE_BLOCK_TYPES)[number];

export const ArticleBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    text: z.string().trim().min(1).max(MAX_ARTICLE_PARAGRAPH),
  }),
  z.object({
    type: z.literal("heading"),
    text: z.string().trim().min(1).max(MAX_ARTICLE_HEADING),
  }),
  z.object({
    type: z.literal("quote"),
    text: z.string().trim().min(1).max(MAX_ARTICLE_QUOTE),
  }),
  z.object({
    type: z.literal("place"),
    place_id: z.string().uuid(),
    note: z.string().trim().max(MAX_ARTICLE_NOTE).nullable().optional(),
  }),
]);

export type ArticleBlock = z.infer<typeof ArticleBlockSchema>;

/** A body must say something: at least one block, capped so a row stays sane. */
export const ArticleBodySchema = z
  .array(ArticleBlockSchema)
  .min(1, "A blog needs at least one block.")
  .max(MAX_ARTICLE_BLOCKS);

/**
 * Tolerant read of a persisted body. The column is jsonb, so a row written by
 * an older shape (or by hand) must degrade to an empty article rather than
 * throwing inside a server component.
 */
export function parseArticleBody(raw: unknown): ArticleBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ArticleBlock[] = [];
  for (const item of raw) {
    const parsed = ArticleBlockSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

const SLUG_BASE_MAX = 52;

/**
 * Title -> slug base. Follows the catalog importer's normalize chain
 * (src/lib/admin/jobs.ts) with one correction: NFKD *decomposes* an accent into
 * its base letter plus a combining mark, so stripping U+0300-U+036F is what
 * actually folds "Cafés" to "cafes". Without it the mark is punctuation to the
 * next replace and you get "cafe-s".
 */
export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, SLUG_BASE_MAX)
      .replace(/-$/, "") || "blog"
  );
}

/**
 * The stored slug: base + a short suffix. Unlike places there is no stable
 * natural key to derive from (two members may legitimately title a blog the
 * same way), so the suffix is supplied by the caller and the unique index on
 * post_articles.slug remains the final word on collisions.
 */
export function articleSlug(title: string, suffix: string): string {
  const clean = suffix.toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean ? `${slugifyTitle(title)}-${clean}` : slugifyTitle(title);
}

const WORDS_PER_MINUTE = 200;

/** Rounded-up reading time over the prose blocks. Always at least 1. */
export function readingMinutes(blocks: ArticleBlock[]): number {
  const words = blocks.reduce((total, block) => {
    if (block.type === "place") return total;
    const count = block.text.split(/\s+/).filter(Boolean).length;
    return total + count;
  }, 0);
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * The article's prose as one plain string: title first, then every text block
 * in order.
 *
 * This is what gets written to `posts.body`, and it is load-bearing rather than
 * a convenience. The moderation gate screens `posts.action` + `posts.body`
 * (src/lib/moderation/gate.ts) - it does not know about post_articles. If the
 * prose only lived in the jsonb column, every blog would sail through text
 * moderation unscreened. Keep these in sync on any write.
 */
export function articlePlainText(title: string, blocks: ArticleBlock[]): string {
  const parts = [title.trim()];
  for (const block of blocks) {
    if (block.type === "place") {
      if (block.note) parts.push(block.note);
      continue;
    }
    parts.push(block.text);
  }
  return parts.filter(Boolean).join("\n\n").trim();
}

/** The place ids a body references, for resolving `place` blocks in one query. */
export function referencedPlaceIds(blocks: ArticleBlock[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === "place") ids.add(block.place_id);
  }
  return [...ids];
}
