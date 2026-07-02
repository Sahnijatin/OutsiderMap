import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { isOpenNow, openStatusLabel } from "@/lib/places/hours";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Experience detail incl. the ordered story cards. Embedding is never selected.
 */
const DETAIL_FIELDS =
  "id, slug, name, area, kind, category, price_level, vibe_tags, description, editor_note, hours, best_for, image_path, story, lat, lng";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`experiences:${ctx.user.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { slug } = await params;
  const { data: place, error } = await ctx.supabase
    .from("places")
    .select(DETAIL_FIELDS)
    .eq("slug", slug)
    .eq("is_published", true)
    .eq("is_chain", false)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!place) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { hours, ...rest } = place;
  return NextResponse.json({
    ...rest,
    open: isOpenNow(hours),
    openLabel: openStatusLabel(hours),
  });
}
