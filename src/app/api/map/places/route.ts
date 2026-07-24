import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getOptionalApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { rateLimitSubject } from "@/lib/security/ip";
import { listMapPlaces } from "@/lib/map/places";

/**
 * GET /api/map/places?city=delhi - the map's data source: every published,
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
  // Anonymous-tolerant (#116): the map is home for everyone. RLS already
  // scopes this to published, non-chain places, so an anon reader sees exactly
  // what the map is meant to show. Anon requests are rate-limited by IP.
  const ctx = await getOptionalApiContext(request);

  const allowed = await checkRateLimit(
    `map-places:${rateLimitSubject(ctx.user, request)}`,
    60,
    60,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  let collection;
  try {
    collection = await listMapPlaces(ctx.supabase, parsed.data.city);
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(collection, {
    headers: {
      // The catalog changes at editorial pace; let repeat pans hit the cache.
      "Cache-Control": "private, max-age=300",
    },
  });
}
