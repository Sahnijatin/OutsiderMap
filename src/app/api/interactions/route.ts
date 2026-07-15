import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { maybeRecomputeLearnedSignals } from "@/lib/taste/learn";
import type { Json } from "@/types/database";

/**
 * Single mobile-friendly endpoint for the interaction taxonomy that feeds the
 * learning loop and the bucket lifecycle. Mirrors the web `savePlace` /
 * `dismissPlace` / `markVisited` server actions, plus the new
 * start/complete bucket transitions. RLS scopes every write to the caller.
 */
const BodySchema = z.object({
  action: z.enum([
    "save",
    "unsave",
    "dismiss",
    "visit",
    "rate",
    "start",
    "complete",
    // Log-only signals (no bucket side effects).
    "chat_pick_click",
    "reel_share",
  ]),
  // Log-only signals may arrive without a place (e.g. sharing a quest reel).
  placeId: z.string().uuid().optional(),
  rating: z.union([z.literal(1), z.literal(-1)]).optional(),
  query: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`interactions:${ctx.user.id}`, 120, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { action, placeId, rating, query } = parsed.data;
  const { user, supabase } = ctx;

  // Everything except the log-only signals acts on a specific place.
  const LOG_ONLY = new Set(["chat_pick_click", "reel_share"]);
  if (placeId === undefined && !LOG_ONLY.has(action)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Bucket-table side effects.
  if (action === "save" && placeId) {
    const { error } = await supabase
      .from("saved_places")
      .upsert({ user_id: user.id, place_id: placeId, status: "saved" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (action === "unsave" && placeId) {
    await supabase
      .from("saved_places")
      .delete()
      .eq("user_id", user.id)
      .eq("place_id", placeId);
  } else if ((action === "start" || action === "complete") && placeId) {
    const { error } = await supabase.from("saved_places").upsert({
      user_id: user.id,
      place_id: placeId,
      status: action === "start" ? "started" : "completed",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // The interaction-event log (append-only). 'rate' carries the score; a bare
  // visit without a rating logs as 'visit'.
  const eventType =
    action === "rate" ? (rating ? "rate" : "visit") : action;
  const payload: Record<string, Json> = {};
  if (rating) payload.rating = rating;
  if (query) payload.query = query;

  const { error: logError } = await supabase.from("interaction_events").insert({
    user_id: user.id,
    event_type: eventType,
    place_id: placeId ?? null,
    payload,
  });
  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  after(async () => {
    await maybeRecomputeLearnedSignals(user.id);
  });

  return NextResponse.json({ ok: true });
}
