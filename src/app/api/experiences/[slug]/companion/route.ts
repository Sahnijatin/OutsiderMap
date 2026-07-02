import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { streamCompanion } from "@/lib/ai/companion";

/**
 * Streams the in-app companion's aside for one experience - the witty second
 * voice (see src/lib/ai/companion.ts). Same auth + rate-limit shape as the
 * "why" stream; chains and unpublished places are never described.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { user, supabase } = ctx;

  const allowed = await checkRateLimit(`companion:${user.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { slug } = await params;
  const [{ data: place }, { data: taste }] = await Promise.all([
    supabase
      .from("places")
      .select(
        "name, area, kind, category, vibe_tags, description, editor_note, hours",
      )
      .eq("slug", slug)
      .eq("is_published", true)
      .eq("is_chain", false)
      .maybeSingle(),
    supabase
      .from("taste_profiles")
      .select("taste_summary")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!place) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const stream = streamCompanion(place, taste?.taste_summary);

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
