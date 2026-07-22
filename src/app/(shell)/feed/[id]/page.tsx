import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { publicMediaUrl } from "@/lib/media/url";
import { POST_MEDIA_BUCKET } from "@/lib/media/post";
import type { PostCard as PostCardData } from "@/lib/feed/read";
import { PostCard } from "../post-card";

const CARD_FIELDS =
  "id, author_id, type, place_id, area, city, action, mood, body, visibility, status, like_count, comment_count, want_count, created_at, place:places(id, slug, name, area)";

/** A single post. RLS (can_view_post) decides whether it's visible at all. */
export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOnboarded();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select(CARD_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (!post) notFound();

  const [{ data: authors }, { data: media }] = await Promise.all([
    supabase.rpc("public_authors", { ids: [post.author_id] }),
    supabase
      .from("post_media")
      .select("kind, path, poster_path, ordinal")
      .eq("post_id", id)
      .order("ordinal"),
  ]);

  const card: PostCardData = {
    id: post.id,
    author_id: post.author_id,
    type: post.type,
    place: post.place ?? null,
    area: post.area,
    city: post.city,
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
      url: publicMediaUrl(POST_MEDIA_BUCKET, m.path),
      posterUrl: publicMediaUrl(POST_MEDIA_BUCKET, m.poster_path),
    })),
    fromNetwork: false,
  };

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-4">
      <Link
        href="/feed"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-dim hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Feed
      </Link>
      <PostCard post={card} headingLevel="h1" />
    </main>
  );
}
