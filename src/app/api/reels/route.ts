import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { resolveCity } from "@/lib/cities";

/**
 * GET /api/reels — the approved reel feed for the member's city, newest
 * first, keyset-paginated by created_at. RLS keeps everything unapproved
 * out (except the member's own).
 */
const QuerySchema = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`reels:${ctx.user.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("home_city")
    .eq("id", ctx.user.id)
    .maybeSingle();
  const city = await resolveCity(ctx.supabase, profile?.home_city);

  const FIELDS =
    "id, source, caption, city, video_path, poster_path, duration_seconds, status, user_id, created_at, place:places(id, slug, name, area)";

  let query = ctx.supabase
    .from("reels")
    .select(FIELDS)
    .eq("status", "approved")
    .eq("city", city.slug)
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);
  if (parsed.data.before) {
    query = query.lt("created_at", parsed.data.before);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // First page only: pin the member's own not-yet-approved reels on top with
  // their real status, so "where's my reel?" answers itself (RLS already
  // lets owners read their own rows).
  let mine: typeof data = [];
  if (!parsed.data.before) {
    const { data: pending } = await ctx.supabase
      .from("reels")
      .select(FIELDS)
      .eq("user_id", ctx.user.id)
      .neq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(3);
    mine = pending ?? [];
  }

  return NextResponse.json({
    reels: [...(mine ?? []), ...(data ?? [])],
    city: city.slug,
  });
}
