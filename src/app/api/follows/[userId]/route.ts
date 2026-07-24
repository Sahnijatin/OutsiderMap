import { NextResponse, type NextRequest } from "next/server";
import { getApiContext, type ApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  FollowTargetSchema,
  isSelfFollow,
  normalizeFollowState,
} from "@/lib/feed/follows";

/**
 * Follow graph for a single member.
 *   GET    - the caller's follow state toward :userId (counts + flags)
 *   POST   - follow :userId (idempotent; a repeat is a no-op success)
 *   DELETE - unfollow :userId
 * RLS pins every write to edges where follower = the caller.
 */

async function followState(ctx: ApiContext, targetId: string) {
  const { data } = await ctx.supabase.rpc("follow_state", { target: targetId });
  return normalizeFollowState(data?.[0]);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`follows:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { userId } = await params;
  if (!FollowTargetSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  return NextResponse.json(await followState(ctx, userId));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`follow-write:${ctx.user.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Slow down a touch." },
      { status: 429 },
    );
  }

  const { userId } = await params;
  if (!FollowTargetSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (isSelfFollow(ctx.user.id, userId)) {
    return NextResponse.json(
      { error: "cannot_follow_self", message: "You can't follow yourself." },
      { status: 400 },
    );
  }

  const { error } = await ctx.supabase
    .from("follows")
    .insert({ follower: ctx.user.id, followee: userId });
  if (error && error.code !== "23505") {
    // 23503: the followee id references no profile.
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "not_found", message: "No such member." },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // 23505 (duplicate PK) means already following - treat as success.

  return NextResponse.json({ ok: true, ...(await followState(ctx, userId)) });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`follow-write:${ctx.user.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { userId } = await params;
  if (!FollowTargetSchema.safeParse(userId).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from("follows")
    .delete()
    .eq("follower", ctx.user.id)
    .eq("followee", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(await followState(ctx, userId)) });
}
