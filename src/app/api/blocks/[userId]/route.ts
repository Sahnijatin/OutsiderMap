import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { BlockTargetSchema, isSelfBlock } from "@/lib/moderation/blocks";

/**
 * POST /api/blocks/[userId] - block a member (idempotent).
 * DELETE - unblock. RLS pins every row to blocker = the caller; blocked users
 * disappear from each other's feed and profile (see hidden_user_ids()).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`block:${ctx.user.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { userId } = await params;
  if (!BlockTargetSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (isSelfBlock(ctx.user.id, userId)) {
    return NextResponse.json(
      { error: "cannot_block_self", message: "You can't block yourself." },
      { status: 400 },
    );
  }

  const { error } = await ctx.supabase
    .from("user_blocks")
    .insert({ blocker: ctx.user.id, blocked: userId });
  if (error && error.code !== "23505") {
    if (error.code === "23503") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, blocked: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { userId } = await params;
  if (!BlockTargetSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from("user_blocks")
    .delete()
    .eq("blocker", ctx.user.id)
    .eq("blocked", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, blocked: false });
}
