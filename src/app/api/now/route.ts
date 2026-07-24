import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { recommend } from "@/lib/now/recommend";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { ANSWER_SERVED, newAnswerId, servedPayload } from "@/lib/events/answers";
import { ONE_ANSWER_VS_LIST, resolveVariant } from "@/lib/experiments/server";

/**
 * Right Now: natural-language ask -> one reasoned answer (+ tonight's events).
 * The HTTP twin of the `askNow` server action, callable by the mobile app with
 * a bearer token. Logs the query for the learning loop off the response path.
 */
const BodySchema = z.object({ query: z.string().trim().min(2).max(500) });

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`now:${ctx.user.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { query } = parsed.data;

  const result = await recommend(ctx.user.id, query, ctx.supabase);

  // A/B: "one" serves a single pick, "list" all three; off → the default set.
  const assignment = await resolveVariant(
    ctx.supabase,
    ONE_ANSWER_VS_LIST,
    ctx.user.id,
  );
  const shownPicks =
    assignment?.variant === "one" ? result.picks.slice(0, 1) : result.picks;
  const answerId = newAnswerId();
  const pickSlugs = shownPicks.map((p) => p.place.slug);

  after(async () => {
    await Promise.all([
      ctx.supabase.from("interaction_events").insert({
        user_id: ctx.user.id,
        event_type: "query",
        payload: {
          query,
          intent: JSON.parse(JSON.stringify(result.intent)),
          picks: pickSlugs,
        },
      }),
      // Precise serve signal (#120); a client echoes answerId on the pick it acts
      // on, and the payload carries the A/B variant for the per-variant read.
      ctx.supabase.from("interaction_events").insert({
        user_id: ctx.user.id,
        event_type: ANSWER_SERVED,
        payload: servedPayload({
          answerId,
          source: "now",
          query,
          picks: pickSlugs,
          experiment: assignment?.experiment,
          variant: assignment?.variant,
        }),
      }),
    ]);
  });

  return NextResponse.json({
    ...result,
    picks: shownPicks,
    answerId,
    variant: assignment?.variant ?? null,
  });
}
