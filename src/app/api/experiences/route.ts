import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { isOpenNow, openStatusLabel } from "@/lib/places/hours";
import type { PlaceKind } from "@/types/database";

/**
 * Browse/filter the published experience catalog (map + filters surface).
 * Chains never appear. RLS already hides unpublished rows; we add the no-chains
 * rule and the published/city filters explicitly. Embeddings are never selected.
 */
const LIST_FIELDS =
  "id, slug, name, area, kind, category, price_level, vibe_tags, description, image_path, hours, lat, lng";

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const kind = params.get("kind");
  const area = params.get("area");
  const maxPrice = params.get("maxPrice");
  const openNow = params.get("openNow") === "true";
  const limit = Math.min(Number(params.get("limit")) || 30, 100);

  let q = ctx.supabase
    .from("places")
    .select(LIST_FIELDS)
    .eq("is_published", true)
    .eq("is_chain", false)
    .eq("city", "delhi")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (kind) q = q.eq("kind", kind as PlaceKind);
  if (area) q = q.eq("area", area);
  if (maxPrice && Number(maxPrice)) q = q.lte("price_level", Number(maxPrice));

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let items = (data ?? []).map(({ hours, ...rest }) => ({
    ...rest,
    open: isOpenNow(hours),
    openLabel: openStatusLabel(hours),
  }));
  if (openNow) items = items.filter((p) => p.open !== false);

  return NextResponse.json({ items });
}
