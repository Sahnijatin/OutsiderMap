import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/** DELETE /api/posts/[id]/comments/[cid] - the author removes their comment. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(
    `comment-delete:${ctx.user.id}`,
    60,
    3600,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const { id, cid } = await params;
  if (
    !z.string().uuid().safeParse(id).success ||
    !z.string().uuid().safeParse(cid).success
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // RLS: delete is pinned to the comment's author.
  const { data, error } = await ctx.supabase
    .from("post_comments")
    .delete()
    .eq("id", cid)
    .eq("post_id", id)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
