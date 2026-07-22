import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { PostPatchSchema } from "@/lib/feed/compose";
import { POST_MEDIA_BUCKET } from "@/lib/media/post";
import { publicMediaUrl } from "@/lib/media/url";

const idOk = (id: string) => z.string().uuid().safeParse(id).success;

/** GET /api/posts/[id] — the post (RLS-gated) plus its ordered media. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!idOk(id)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // RLS: can_view_post decides visibility; an unseen post reads as absent.
  const { data: post } = await ctx.supabase
    .from("posts")
    .select(
      "id, author_id, type, place_id, area, city, action, mood, body, visibility, location_precision, status, like_count, comment_count, want_count, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: media } = await ctx.supabase
    .from("post_media")
    .select("id, kind, path, poster_path, ordinal")
    .eq("post_id", id)
    .order("ordinal");

  return NextResponse.json({
    post,
    media: (media ?? []).map((m) => ({
      id: m.id,
      kind: m.kind,
      ordinal: m.ordinal,
      url: publicMediaUrl(POST_MEDIA_BUCKET, m.path),
      posterUrl: publicMediaUrl(POST_MEDIA_BUCKET, m.poster_path),
    })),
  });
}

/** PATCH /api/posts/[id] — author edits their own post's editable fields. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`post-edit:${ctx.user.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  if (!idOk(id)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const parsed = PostPatchSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  // RLS pins the write to the author; the protect_post_columns trigger blocks
  // any attempt to smuggle status/counter changes through this route.
  const { data, error } = await ctx.supabase
    .from("posts")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/posts/[id] — author removes their own post and its media. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!idOk(id)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Collect storage paths before the rows cascade away.
  const { data: media } = await ctx.supabase
    .from("post_media")
    .select("path, poster_path")
    .eq("post_id", id);

  const { data: deleted, error } = await ctx.supabase
    .from("posts")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const paths = (media ?? [])
    .flatMap((m) => [m.path, m.poster_path])
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    const admin = createAdminClient();
    await admin.storage.from(POST_MEDIA_BUCKET).remove(paths);
  }

  return NextResponse.json({ ok: true });
}
