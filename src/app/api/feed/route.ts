import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { resolveCity } from "@/lib/cities";

/**
 * The home/lobby feed: the proactive engine living in a scroll (no push yet).
 *  - forYou: experiences nearest the member's taste vector (consent-gated;
 *    falls back to freshest when off or cold).
 *  - fresh: newest published drops.
 *  - tonight: events starting soon, already tier-scoped by RLS.
 * Embeddings are never returned to the client.
 */
const SLIM_FIELDS =
  "id, slug, name, area, kind, category, price_level, vibe_tags, description, image_path";

function parseStoredEmbedding(raw: unknown): number[] | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      return parsed as number[];
    }
  } catch {
    // corrupt -> no taste vector
  }
  return null;
}

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { supabase } = ctx;

  const allowed = await checkRateLimit(`feed:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const [{ data: profile }, { data: taste }] = await Promise.all([
    supabase
      .from("profiles")
      .select("personalization_enabled, home_city")
      .eq("id", ctx.user.id)
      .maybeSingle(),
    supabase
      .from("taste_profiles")
      .select("embedding")
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
  ]);

  const personalize = profile?.personalization_enabled !== false;
  const city = await resolveCity(supabase, profile?.home_city);
  const tasteEmbedding = personalize ? parseStoredEmbedding(taste?.embedding) : null;

  // forYou: taste-matched if we have a vector, else freshest.
  let forYou: unknown[] = [];
  if (tasteEmbedding) {
    const { data } = await supabase.rpc("match_places", {
      query_embedding: JSON.stringify(tasteEmbedding),
      match_count: 10,
      filter_city: city.slug,
      filter_area: null,
      max_price_level: null,
    });
    forYou = data ?? [];
  }

  const { data: fresh } = await supabase
    .from("places")
    .select(SLIM_FIELDS)
    .eq("is_published", true)
    .eq("is_chain", false)
    .eq("city", city.slug)
    .order("created_at", { ascending: false })
    .limit(10);
  if (forYou.length === 0) forYou = fresh ?? [];

  const now = new Date();
  const cutoff = new Date(now.getTime() + 14 * 60 * 60 * 1000);
  const { data: tonight } = await supabase
    .from("events")
    .select("id, title, venue_name, area, starts_at, is_underground")
    .eq("is_published", true)
    .gte("starts_at", new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString())
    .lte("starts_at", cutoff.toISOString())
    .order("starts_at", { ascending: true })
    .limit(5);

  return NextResponse.json({
    forYou,
    fresh: fresh ?? [],
    tonight: tonight ?? [],
  });
}
