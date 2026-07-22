import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { MAX_POST_BODY } from "@/lib/feed/compose";

/**
 * GET  /api/posts/[id]/comments — approved comments, oldest first, with
 *   public author identity.
 * POST /api/posts/[id]/comments — add a comment (RLS: only on a visible post).
 */
const idOk = (id: string) => z.string().uuid().safeParse(id).success;
const CreateSchema = z.object({
  body: z.string().trim().min(1).max(MAX_POST_BODY),
});

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

  // RLS: comments are visible only if the parent post is (and approved / own).
  const { data: comments } = await ctx.supabase
    .from("post_comments")
    .select("id, author_id, body, created_at")
    .eq("post_id", id)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(200);

  const authorIds = [...new Set((comments ?? []).map((c) => c.author_id))];
  const authorById = new Map();
  if (authorIds.length > 0) {
    const { data: authors } = await ctx.supabase.rpc("public_authors", {
      ids: authorIds,
    });
    for (const a of authors ?? []) authorById.set(a.id, a);
  }

  return NextResponse.json({
    comments: (comments ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      author_id: c.author_id,
      author: authorById.get(c.author_id) ?? null,
      mine: c.author_id === ctx.user.id,
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`comment:${ctx.user.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!idOk(id) || !parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // RLS with-check pins author = self and requires the post be visible.
  const { data, error } = await ctx.supabase
    .from("post_comments")
    .insert({ post_id: id, author_id: ctx.user.id, body: parsed.data.body })
    .select("id, body, created_at")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "not_allowed", message: "Couldn't add that comment." },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, comment: data }, { status: 201 });
}
