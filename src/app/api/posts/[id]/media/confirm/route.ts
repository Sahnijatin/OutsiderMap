import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { MediaConfirmSchema } from "@/lib/feed/compose";
import {
  POST_MEDIA_BUCKET,
  verifyPostObject,
} from "@/lib/media/post";
import { publicMediaUrl } from "@/lib/media/url";
import { moderatePost } from "@/lib/moderation/gate";

/**
 * POST - after the client PUTs to the signed URL, verify the object landed
 * (and fits the cap), then record the post_media row at the next ordinal.
 * Returns the post's media list with public display URLs. Mirrors the quest
 * media confirm route.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(
    `post-media-confirm:${ctx.user.id}`,
    60,
    3600,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const parsed = MediaConfirmSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { path, kind, posterPath } = parsed.data;

  // Paths are server-issued and owner+post-prefixed; only accept ones that
  // belong to this exact user and post.
  const expectedPrefix = `p/${ctx.user.id}/${id}/`;
  if (!path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (posterPath && !posterPath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createAdminClient();
  let object: { size: number } | null;
  try {
    object = await verifyPostObject(admin, path);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: "too_large", message }, { status: 400 });
  }
  if (!object) {
    return NextResponse.json(
      { error: "missing", message: "Upload didn't finish - try again." },
      { status: 400 },
    );
  }

  // Next ordinal from the current media count (RLS scopes to visible rows;
  // for a pending own-post that's exactly this author's media).
  const { count } = await ctx.supabase
    .from("post_media")
    .select("id", { count: "exact", head: true })
    .eq("post_id", id);

  // RLS enforces: the parent post is owned by the caller.
  const { error: insertError } = await ctx.supabase.from("post_media").insert({
    post_id: id,
    kind,
    path,
    poster_path: posterPath ?? null,
    ordinal: count ?? 0,
  });
  if (insertError) {
    await admin.storage.from(POST_MEDIA_BUCKET).remove([path]);
    return NextResponse.json(
      { error: "not_editable", message: "This post can't take more media." },
      { status: 400 },
    );
  }

  // Re-screen the post now that it has media (CSAM + image); a media post is
  // pre-screened before it can go public. Best-effort: on failure the post
  // stays pending for human review.
  try {
    await moderatePost(admin, id);
  } catch (err) {
    console.error("post media moderation gate failed; leaving pending", err);
  }

  const { data: media } = await ctx.supabase
    .from("post_media")
    .select("id, kind, path, poster_path, ordinal")
    .eq("post_id", id)
    .order("ordinal");

  return NextResponse.json({
    media: (media ?? []).map((m) => ({
      id: m.id,
      kind: m.kind,
      ordinal: m.ordinal,
      url: publicMediaUrl(POST_MEDIA_BUCKET, m.path),
      posterUrl: publicMediaUrl(POST_MEDIA_BUCKET, m.poster_path),
    })),
  });
}
