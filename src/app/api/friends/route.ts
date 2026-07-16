import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { UsernameSchema } from "@/lib/identity/username";
import {
  counterpartId,
  partitionFriendships,
  type PublicMember,
} from "@/lib/friends/model";

/** GET /api/friends — {friends, incoming, outgoing} with public identities. */
export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`friends:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // RLS scopes rows to the viewer's participation.
  const { data: rows, error } = await ctx.supabase
    .from("friendships")
    .select("id, requester, addressee, status, created_at, responded_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = [
    ...new Set((rows ?? []).map((r) => counterpartId(r, ctx.user.id))),
  ];
  let members = new Map<string, PublicMember>();
  if (ids.length > 0) {
    const { data: publics } = await ctx.supabase.rpc("get_public_profiles", {
      ids,
    });
    members = new Map((publics ?? []).map((p) => [p.id, p]));
  }

  return NextResponse.json(
    partitionFriendships(rows ?? [], ctx.user.id, members),
  );
}

const RequestSchema = z.object({ username: UsernameSchema });

/** POST /api/friends — send a request by exact username. */
export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`friend-req:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Easy - try again in a bit." },
      { status: 429 },
    );
  }

  const parsed = RequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad request", message: "That doesn't look like a username." },
      { status: 400 },
    );
  }

  const { data: matches } = await ctx.supabase.rpc("find_member_by_username", {
    candidate: parsed.data.username,
  });
  const target = matches?.[0];
  if (!target) {
    return NextResponse.json(
      { error: "not_found", message: "No outsider by that name." },
      { status: 404 },
    );
  }

  const { error } = await ctx.supabase.from("friendships").insert({
    requester: ctx.user.id,
    addressee: target.id,
  });
  if (error) {
    // Unique pair index: a row already exists in either direction.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "exists", message: "Already connected or pending." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, member: target });
}

const IdSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/friends — accept an incoming request (RLS pins to addressee). */
export async function PATCH(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`friends:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = IdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", parsed.data.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/friends — decline, cancel or unfriend (one verb, RLS-scoped). */
export async function DELETE(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`friends:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = IdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from("friendships")
    .delete()
    .eq("id", parsed.data.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
