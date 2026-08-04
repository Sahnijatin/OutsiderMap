import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { publicMediaUrl } from "@/lib/media/url";
import { Screen } from "@/components/app/screen";
import type { PostCard as PostCardData } from "@/lib/feed/read";
import { CARD_FIELDS } from "@/lib/feed/query";
import { resolvePostLocation } from "@/lib/feed/location";
import { PostCard } from "../post-card";
import { PostActions } from "./post-actions";
import { Comments } from "./comments";

/** A single post. RLS (can_view_post) decides whether it's visible at all. */
export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireOnboarded();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select(CARD_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  const [{ data: authors }, { data: media }, { data: myReactions }] =
    await Promise.all([
      supabase.rpc("public_authors", { ids: [post.author_id] }),
      supabase
        .from("post_media")
        .select("kind, path, poster_path, ordinal, bucket")
        .eq("post_id", id)
        .order("ordinal"),
      supabase
        .from("post_reactions")
        .select("kind")
        .eq("post_id", id)
        .eq("user_id", me.id),
    ]);
  const reactedKinds = new Set((myReactions ?? []).map((r) => r.kind));

  const loc = resolvePostLocation(post.location_precision, post.place ?? null, post.area);
  const card: PostCardData = {
    id: post.id,
    author_id: post.author_id,
    type: post.type,
    place: loc.place,
    area: loc.area,
    city: post.city,
    location_precision: post.location_precision,
    action: post.action,
    mood: post.mood,
    body: post.body,
    visibility: post.visibility,
    created_at: post.created_at,
    like_count: post.like_count,
    comment_count: post.comment_count,
    want_count: post.want_count,
    author: authors?.[0] ?? null,
    media: (media ?? []).map((m) => ({
      kind: m.kind,
      url: publicMediaUrl(m.bucket, m.path),
      posterUrl: publicMediaUrl(m.bucket, m.poster_path),
    })),
    article: post.article ?? null,
    fromNetwork: false,
  };

  return (
    <Screen width="narrow">
      <Link
        href="/feed"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-dim hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Feed
      </Link>
      <PostCard post={card} headingLevel="h1" />
      <PostActions
        postId={card.id}
        initialLiked={reactedKinds.has("like")}
        initialWanted={reactedKinds.has("want_to_go")}
        likeCount={card.like_count}
        wantCount={card.want_count}
      />
      <div className="mt-2 border-t border-line pt-4">
        <Comments postId={card.id} />
      </div>
    </Screen>
  );
}
