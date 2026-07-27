import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { publicMediaUrl } from "@/lib/media/url";
import { normalizeFollowState } from "@/lib/feed/follows";
import type { PostCard } from "@/lib/feed/read";

/**
 * GET /api/profile/[username] - a public profile: identity, follow state +
 * counts, and the posts this viewer is allowed to see (RLS via
 * can_view_post). Used by the profile page and mobile.
 */
const CARD_FIELDS =
  "id, author_id, type, place_id, area, city, action, mood, body, visibility, status, like_count, comment_count, want_count, created_at, place:places(id, slug, name, area)";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`profile-view:${ctx.user.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { username } = await params;
  if (!z.string().min(3).max(20).safeParse(username).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { data: profiles } = await ctx.supabase.rpc("public_profile", {
    candidate: username,
  });
  const profile = profiles?.[0];
  if (!profile) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // A blocked member (either direction) is invisible - treat as not found.
  if (profile.id !== ctx.user.id) {
    const { data: hidden } = await ctx.supabase.rpc("hidden_user_ids");
    if (((hidden as string[] | null) ?? []).includes(profile.id)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  const [{ data: follow }, { data: rawPosts }] = await Promise.all([
    ctx.supabase.rpc("follow_state", { target: profile.id }),
    ctx.supabase
      .from("posts")
      .select(CARD_FIELDS)
      .eq("author_id", profile.id)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const postRows = rawPosts ?? [];
  const mediaByPost = new Map<string, PostCard["media"]>();
  if (postRows.length > 0) {
    const { data: media } = await ctx.supabase
      .from("post_media")
      .select("post_id, kind, path, poster_path, ordinal, bucket")
      .in(
        "post_id",
        postRows.map((p) => p.id),
      )
      .order("ordinal");
    for (const m of media ?? []) {
      const list = mediaByPost.get(m.post_id) ?? [];
      list.push({
        kind: m.kind,
        url: publicMediaUrl(m.bucket, m.path),
        posterUrl: publicMediaUrl(m.bucket, m.poster_path),
      });
      mediaByPost.set(m.post_id, list);
    }
  }

  const author = {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    outsider_number: profile.outsider_number,
  };
  const posts: PostCard[] = postRows.map((p) => ({
    id: p.id,
    author_id: p.author_id,
    type: p.type,
    place: p.place ?? null,
    area: p.area,
    city: p.city,
    action: p.action,
    mood: p.mood,
    body: p.body,
    visibility: p.visibility,
    created_at: p.created_at,
    like_count: p.like_count,
    comment_count: p.comment_count,
    want_count: p.want_count,
    author,
    media: mediaByPost.get(p.id) ?? [],
    fromNetwork: false,
  }));

  return NextResponse.json({
    profile: author,
    follow: normalizeFollowState(follow?.[0]),
    isSelf: profile.id === ctx.user.id,
    posts,
  });
}
