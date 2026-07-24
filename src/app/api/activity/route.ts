import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * GET  /api/activity - the caller's activity (RLS: recipient = self), newest
 *   first, with actor identity + an unread count.
 * POST /api/activity - mark all of the caller's activity read.
 * This is the action stream, separate from the content feed. Push delivery is
 * still deferred; events persist here now.
 */
export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`activity:${ctx.user.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const [{ data: events }, { count: unread }] = await Promise.all([
    ctx.supabase
      .from("activity_events")
      .select("id, actor_id, type, post_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(60),
    ctx.supabase
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  const rows = events ?? [];
  const actorIds = [...new Set(rows.map((r) => r.actor_id))];
  const actorById = new Map();
  if (actorIds.length > 0) {
    const { data: actors } = await ctx.supabase.rpc("public_authors", {
      ids: actorIds,
    });
    for (const a of actors ?? []) actorById.set(a.id, a);
  }

  return NextResponse.json({
    unread: unread ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      post_id: r.post_id,
      created_at: r.created_at,
      read: r.read_at != null,
      actor: actorById.get(r.actor_id) ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS pins the update to the caller's own rows.
  const { error } = await ctx.supabase
    .from("activity_events")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
