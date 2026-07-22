import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext, type ApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  allowedPostMediaExt,
  MAX_POST_MEDIA,
  MAX_POST_MEDIA_BYTES,
  MediaIssueSchema,
} from "@/lib/feed/compose";
import {
  issuePostUpload,
  POST_MEDIA_BUCKET,
  postMediaPath,
} from "@/lib/media/post";

/**
 * POST — issue a signed direct-to-Storage upload URL for the author's own,
 * still-pending post. DELETE — drop one of the post's media rows + object.
 */

const idOk = (id: string) => z.string().uuid().safeParse(id).success;

/** The post, only if the caller owns it and it hasn't been moderated yet. */
async function ownedPendingPost(ctx: ApiContext, postId: string) {
  const { data: post } = await ctx.supabase
    .from("posts")
    .select("id, author_id, status")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.author_id !== ctx.user.id) return null;
  if (post.status !== "pending") return null;
  return post;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`post-media:${ctx.user.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  if (!idOk(id)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const parsed = MediaIssueSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { kind, ext, size } = parsed.data;
  if (!allowedPostMediaExt(kind, ext)) {
    return NextResponse.json(
      { error: "unsupported", message: "That file type isn't supported." },
      { status: 400 },
    );
  }
  if (size > MAX_POST_MEDIA_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "150MB max per file." },
      { status: 400 },
    );
  }

  const post = await ownedPendingPost(ctx, id);
  if (!post) {
    return NextResponse.json(
      { error: "not_editable", message: "This post can't take more media." },
      { status: 400 },
    );
  }

  const { count } = await ctx.supabase
    .from("post_media")
    .select("id", { count: "exact", head: true })
    .eq("post_id", id);
  if ((count ?? 0) >= MAX_POST_MEDIA) {
    return NextResponse.json(
      { error: "full", message: `Up to ${MAX_POST_MEDIA} per post.` },
      { status: 400 },
    );
  }

  const path = postMediaPath({ userId: ctx.user.id, postId: id, ext });
  const admin = createAdminClient();
  const upload = await issuePostUpload(admin, path);
  return NextResponse.json({ ...upload, bucket: POST_MEDIA_BUCKET, kind });
}

const DeleteSchema = z.object({ path: z.string().min(1).max(300) });

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
  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const post = await ownedPendingPost(ctx, id);
  if (!post) {
    return NextResponse.json({ error: "not_editable" }, { status: 400 });
  }

  // RLS: post_media delete is pinned to the parent post's author.
  const { data: removed } = await ctx.supabase
    .from("post_media")
    .delete()
    .eq("post_id", id)
    .eq("path", parsed.data.path)
    .select("id");
  if (removed && removed.length > 0) {
    const admin = createAdminClient();
    await admin.storage.from(POST_MEDIA_BUCKET).remove([parsed.data.path]);
  }
  return NextResponse.json({ ok: true });
}
