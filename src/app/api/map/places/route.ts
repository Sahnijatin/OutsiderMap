import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * GET /api/map/places?city=delhi — the map's data source: every published,
 * mappable place in a city as a slim GeoJSON FeatureCollection. RLS already
 * scopes this to published rows; chains are excluded by product law.
 */
const QuerySchema = z.object({
  city: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z-]{2,40}$/)
    .default("delhi"),
});

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`map-places:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { data: places, error } = await ctx.supabase
    .from("places")
    .select("id, slug, name, area, kind, category, price_level, lat, lng, image_path")
    .eq("city", parsed.data.city)
    .eq("is_published", true)
    .eq("is_chain", false)
    .not("lat", "is", null)
    .not("lng", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const collection = {
    type: "FeatureCollection" as const,
    features: (places ?? []).map((p) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [p.lng as number, p.lat as number],
      },
      properties: {
        id: p.id,
        slug: p.slug,
        name: p.name,
        area: p.area,
        kind: p.kind,
        category: p.category,
        price_level: p.price_level,
        image_path: p.image_path,
      },
    })),
  };

  return NextResponse.json(collection, {
    headers: {
      // The catalog changes at editorial pace; let repeat pans hit the cache.
      "Cache-Control": "private, max-age=300",
    },
  });
}
