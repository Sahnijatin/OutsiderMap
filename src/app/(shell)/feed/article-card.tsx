import Link from "next/link";
import { BookOpen, Heart, MapPin, MessageCircle, Star } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { PostCard as PostCardData } from "@/lib/feed/read";
import { PostCard } from "./post-card";

/**
 * A member blog in the feed. Deliberately a sibling of PostCard rather than a
 * branch inside it: a blog leads with a title and the place it is about, not
 * with media, and post-card.tsx should not learn a second layout.
 *
 * The whole card links to /blog/[slug], which opens the blog together with the
 * place it was written for.
 */
export function ArticleCard({
  post,
  headingLevel = "h2",
}: {
  post: PostCardData;
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  const article = post.article;
  if (!article) return null;

  const author = post.author?.username
    ? `@${post.author.username}`
    : (post.author?.display_name ?? "An outsider");

  return (
    <article className="om-rise-in overflow-hidden rounded-card border border-line bg-surface">
      <Link href={`/blog/${article.slug}`} className="block px-4 pt-4">
        <span className="voice inline-flex items-center gap-1.5">
          <BookOpen className="size-3.5" />
          Blog
          {article.reading_minutes ? ` · ${article.reading_minutes} min` : ""}
        </span>
        <Heading className="mt-2 text-balance font-display text-xl italic lg:text-2xl">
          {article.title}
        </Heading>
      </Link>

      <div className="px-4 pb-3 pt-2">
        {post.place && (
          <Link
            href={`/place/${post.place.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink hover:border-accent"
          >
            <MapPin className="size-3.5 text-accent" />
            <span className="truncate">
              {post.place.name}
              {post.place.area ? ` · ${post.place.area}` : ""}
            </span>
          </Link>
        )}
        <p className="mt-2 text-xs text-ink-dim">
          {author} · {formatRelativeTime(post.created_at)}
        </p>
      </div>

      <footer className="flex items-center gap-5 px-4 py-3 text-ink-dim">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Heart className="size-4" /> {post.like_count}
        </span>
        <Link
          href={`/blog/${article.slug}`}
          className="inline-flex items-center gap-1.5 text-xs hover:text-ink"
        >
          <MessageCircle className="size-4" /> {post.comment_count}
        </Link>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            post.want_count > 0 && "text-accent",
          )}
        >
          <Star className="size-4" /> {post.want_count}
        </span>
      </footer>
    </article>
  );
}

/**
 * Picks the card for a feed row. The one place that switches on post type, so
 * neither card component has to know the other exists. An article row missing
 * its child (shouldn't happen - the write path rolls back) falls back to the
 * ordinary post card rather than rendering nothing.
 */
export function FeedCard({
  post,
  headingLevel,
}: {
  post: PostCardData;
  headingLevel?: "h1" | "h2";
}) {
  if (post.type === "article" && post.article) {
    return <ArticleCard post={post} headingLevel={headingLevel} />;
  }
  return <PostCard post={post} headingLevel={headingLevel} />;
}
