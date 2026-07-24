import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * GET /api/places/search?q=&city= - the composer's catalog place picker.
 * Name-matches published places (RLS already hides unpublished ones) so a
 * post can anchor to a real catalog place. Not semantic search - just a
 * fast typeahead over names within a city.
 */
const QuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  city: z.string().trim().min(1).max(60).optional(),
});

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`place-search:${ctx.user.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    city: url.searchParams.get("city") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ places: [] });
  }

  // Strip PostgREST filter grammar so a stray char can't break/inject the ilike.
  const term = parsed.data.q.replace(/[,()*%]/g, "").trim();
  if (term.length < 2) {
    return NextResponse.json({ places: [] });
  }

  let query = ctx.supabase
    .from("places")
    .select("id, slug, name, area, category")
    .eq("is_published", true)
    .ilike("name", `%${term}%`)
    .limit(12);
  if (parsed.data.city) {
    query = query.eq("city", parsed.data.city);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ places: data ?? [] });
}
