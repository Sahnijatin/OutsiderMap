import Link from "next/link";
import { Heart, MapPin, MessageCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostCard as PostCardData } from "@/lib/feed/read";

/** Relative "time ago" in coarse units - good enough for a feed timestamp. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

function authorLabel(author: PostCardData["author"]): string {
  if (author?.username) return `@${author.username}`;
  if (author?.display_name) return author.display_name;
  return "An outsider";
}

/**
 * One feed post. A discovery card first: author, the place it's anchored to,
 * what they said, media, and the engagement counts. Counts are display-only
 * here; the like / comment / want_to_go actions land in #75.
 */
export function PostCard({
  post,
  headingLevel = "h2",
}: {
  post: PostCardData;
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  const first = post.media[0];

  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface">
      <header className="flex items-center gap-3 px-4 pt-4">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raise text-sm text-ink-dim">
          {post.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.author.avatar_url}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            authorLabel(post.author).replace("@", "").charAt(0).toUpperCase()
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-ink">
            {authorLabel(post.author)}
            {post.author?.outsider_number != null && (
              <span className="ml-1.5 font-mono text-[0.65rem] text-ink-dim">
                #{post.author.outsider_number}
              </span>
            )}
          </span>
          <span className="text-xs text-ink-dim">{timeAgo(post.created_at)}</span>
        </div>
      </header>

      <div className="px-4 py-3">
        {post.place && (
          <Link
            href={`/place/${post.place.slug}`}
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink hover:border-accent"
          >
            <MapPin className="size-3.5 text-accent" />
            <span className="truncate">
              {post.place.name}
              {post.place.area ? ` · ${post.place.area}` : ""}
            </span>
          </Link>
        )}
        <Heading className="text-sm text-ink">
          <Link href={`/feed/${post.id}`} className="hover:underline">
            {post.action && <span className="text-ink-dim">{post.action} · </span>}
            {post.body ?? (post.action ? "" : "Shared a place")}
          </Link>
        </Heading>
      </div>

      {first && (
        <Link href={`/feed/${post.id}`} className="relative block bg-night">
          {first.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={first.url ?? undefined}
              alt=""
              className="max-h-[32rem] w-full object-cover"
            />
          ) : (
            <video
              src={first.url ?? undefined}
              poster={first.posterUrl ?? undefined}
              className="max-h-[32rem] w-full object-cover"
              controls
              playsInline
            />
          )}
          {post.media.length > 1 && (
            <span className="absolute right-2 top-2 rounded-full bg-night/70 px-2 py-0.5 text-xs text-ink">
              +{post.media.length - 1}
            </span>
          )}
        </Link>
      )}

      <footer className="flex items-center gap-5 px-4 py-3 text-ink-dim">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Heart className="size-4" /> {post.like_count}
        </span>
        <Link
          href={`/feed/${post.id}`}
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
