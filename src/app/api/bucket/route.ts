import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * The member's bucket: saved/started/completed experiences with the same slim
 * place shape the feed returns. RLS scopes `saved_places` to the caller, so no
 * explicit user filter is needed.
 */
const SLIM_FIELDS =
  "id, slug, name, area, kind, category, price_level, vibe_tags, description, image_path";

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`bucket:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { data, error } = await ctx.supabase
    .from("saved_places")
    .select(`status, created_at, places(${SLIM_FIELDS})`)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? [])
    .filter((row) => row.places)
    .map((row) => ({ status: row.status, place: row.places }));

  return NextResponse.json({ items });
}
