import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, MapPin } from "lucide-react";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRelativeTime } from "@/lib/utils";
import { parseArticleBody, referencedPlaceIds } from "@/lib/blog/blocks";
import { ArticleBody, type ArticlePlace } from "@/components/blog/article-body";
import { Screen } from "@/components/app/screen";
import { PostActions } from "../../feed/[id]/post-actions";
import { Comments } from "../../feed/[id]/comments";

export const metadata: Metadata = { title: "Blog" };

/**
 * A member blog. Reached from the feed or from the place page.
 *
 * Visibility is entirely RLS's decision (can_view_post): a place-only blog is
 * as readable as a public one, it simply never entered the feed. A blog whose
 * post is still pending moderation is visible to its author and admins only,
 * which falls out of the same policy.
 */
export default async function BlogPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const me = await requireOnboarded();
  const { slug } = await params;

  const supabase = await createClient();
  const { data: article } = await supabase
    .from("post_articles")
    .select(
      // places is pinned to posts_place_id_fkey: post_article_places is a
      // junction table, so PostgREST also infers a many-to-many posts<->places
      // path and an unqualified embed is ambiguous (PGRST201). See CARD_FIELDS.
      "post_id, title, body, reading_minutes, created_at, post:posts(id, author_id, place_id, status, created_at, like_count, want_count, place:places!posts_place_id_fkey(id, slug, name, area))",
    )
    .eq("slug", slug)
    .maybeSingle();

  // No row also means "RLS hid it" - a 404 is the right answer either way.
  if (!article?.post) notFound();
  const post = article.post;

  const blocks = parseArticleBody(article.body);
  const blockPlaceIds = referencedPlaceIds(blocks);

  const [{ data: authors }, { data: extraLinks }, { data: myReactions }] =
    await Promise.all([
      supabase.rpc("public_authors", { ids: [post.author_id] }),
      supabase
        .from("post_article_places")
        .select("sort_order, place:places(id, slug, name, area)")
        .eq("post_id", post.id)
        .order("sort_order"),
      supabase
        .from("post_reactions")
        .select("kind")
        .eq("post_id", post.id)
        .eq("user_id", me.id),
    ]);

  // Places named inside the body, resolved in one go. Unpublished ones simply
  // don't come back and their block renders nothing.
  const bodyPlaces = new Map<string, ArticlePlace>();
  if (blockPlaceIds.length > 0) {
    const { data: rows } = await supabase
      .from("places")
      .select("id, slug, name, area")
      .in("id", blockPlaceIds);
    for (const row of rows ?? []) bodyPlaces.set(row.id, row);
  }

  const author = authors?.[0] ?? null;
  const reacted = new Set((myReactions ?? []).map((r) => r.kind));
  const anchor = post.place;
  const extras = (extraLinks ?? [])
    .map((row) => row.place)
    .filter((p): p is ArticlePlace => Boolean(p) && p!.id !== anchor?.id);

  return (
    <Screen width="narrow">
      <Link
        href="/feed"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-dim hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Feed
      </Link>

      <article className="flex flex-col gap-5">
        <header className="flex flex-col gap-2">
          <h1 className="text-balance font-display text-3xl italic lg:text-4xl">
            {article.title}
          </h1>
          <p className="text-sm text-ink-dim">
            {author?.username ? `@${author.username}` : "A member"}
            {" · "}
            {formatRelativeTime(post.created_at)}
            {article.reading_minutes ? ` · ${article.reading_minutes} min read` : ""}
          </p>
          {post.status !== "approved" && (
            <p className="rounded-xl border border-line bg-raise px-4 py-2.5 text-sm text-ink-dim">
              In review. Only you can see this until it clears.
            </p>
          )}
        </header>

        {/* The place this was written for - the reason someone opened it. */}
        {anchor && (
          <Link
            href={`/place/${anchor.slug}`}
            className="flex items-center gap-2 rounded-card border border-accent/40 bg-accent/5 px-4 py-3 transition-colors hover:border-accent"
          >
            <MapPin className="size-4 shrink-0 text-accent" />
            <span className="flex flex-col">
              <span className="font-display text-lg italic">{anchor.name}</span>
              {anchor.area && (
                <span className="text-xs text-ink-dim">{anchor.area}</span>
              )}
            </span>
            <span className="voice ml-auto">Open</span>
          </Link>
        )}

        <ArticleBody blocks={blocks} places={bodyPlaces} />

        {extras.length > 0 && (
          <section className="flex flex-col gap-2 border-t border-line pt-5">
            <h2 className="voice">Also in this blog</h2>
            <ul className="flex flex-col gap-2">
              {extras.map((place) => (
                <li key={place.id}>
                  <Link
                    href={`/place/${place.slug}`}
                    className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-colors hover:border-accent/50"
                  >
                    <span className="font-display text-lg italic">{place.name}</span>
                    {place.area && (
                      <span className="text-sm text-ink-dim">{place.area}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      <PostActions
        postId={post.id}
        initialLiked={reacted.has("like")}
        initialWanted={reacted.has("want_to_go")}
        likeCount={post.like_count}
        wantCount={post.want_count}
      />
      <div className="mt-2 border-t border-line pt-4">
        <Comments postId={post.id} />
      </div>
    </Screen>
  );
}
