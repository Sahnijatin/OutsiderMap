import { NextResponse, after, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { firstTasteAnswer } from "@/lib/now/activation";
import { publicMediaUrl } from "@/lib/media/url";
import { ANSWER_SERVED, newAnswerId, servedPayload } from "@/lib/events/answers";

/**
 * POST /api/activation - the first-answer moment (#121). Generates one confident,
 * taste-derived pick for a brand-new member (no query needed), emits the precise
 * answer_served event (source "activation", so time-to-first-answer =
 * served − onboarding_completed_at and accept-rate is measurable), and marks the
 * member activated so the beat fires exactly once. Best-effort: even when no pick
 * comes back, we mark activated so the welcome screen never loops.
 */
export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`activation:${ctx.user.id}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const pick = await firstTasteAnswer(ctx.supabase, ctx.user.id);
  const answerId = newAnswerId();

  after(async () => {
    await Promise.all([
      ctx.supabase
        .from("profiles")
        .update({ activated_at: new Date().toISOString() })
        .eq("id", ctx.user.id),
      pick
        ? ctx.supabase.from("interaction_events").insert({
            user_id: ctx.user.id,
            event_type: ANSWER_SERVED,
            place_id: pick.place.id,
            payload: servedPayload({
              answerId,
              source: "activation",
              picks: [pick.place.slug],
            }),
          })
        : Promise.resolve(),
    ]);
  });

  return NextResponse.json({
    answerId,
    pick: pick
      ? {
          id: pick.place.id,
          slug: pick.place.slug,
          name: pick.place.name,
          area: pick.place.area,
          image: publicMediaUrl("place-images", pick.place.image_path),
          reason: pick.reason,
        }
      : null,
  });
}
