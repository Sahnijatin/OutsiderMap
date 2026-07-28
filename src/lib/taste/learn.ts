import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmbeddings } from "@/lib/ai";
import { serverEnv } from "@/lib/env";
import {
  TasteDimensionsSchema,
  tasteEmbeddingText,
} from "@/lib/taste/profile";

/**
 * The learning loop: distills interaction_events into learned_signals and
 * refreshes the taste embedding with what the person actually does.
 * Service-role only - learned columns are not owner-writable by policy
 * intent. Runs nightly via /api/cron/recompute and opportunistically
 * (every RECOMPUTE_EVERY events) after saves/dismisses.
 */

export const RECOMPUTE_EVERY = 10;

const EVENT_WEIGHTS: Record<string, number> = {
  // 'quest_complete'/'complete' are gold signals - they actually went.
  quest_complete: 6,
  complete: 5,
  stop_complete: 4,
  reel_share: 4,
  start: 3,
  save: 3,
  bucket_add: 3,
  quest_start: 3,
  visit: 2,
  rate: 2,
  plan_add: 2,
  rec_click: 1,
  chat_pick_click: 1,
  dismiss: -2,
  unsave: -1,
};

/**
 * How long a signal takes to count half as much.
 *
 * Without this, every one of the last 500 events counts the same, so taste from
 * six months ago outvotes last week - in a product whose embedding text
 * literally says "Lately drawn to". Sixty days is a guess at how fast taste
 * drifts, and it is the one number here that wants checking against the eval
 * once there is one: too short and a quiet fortnight erases someone, too long
 * and this does nothing.
 *
 * Ratios are unaffected, so the explore/exploit dial - which reads shares, not
 * magnitudes - behaves exactly as before.
 */
const HALF_LIFE_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 1 for something that just happened, 0.5 at one half-life, and so on. */
export function recencyFactor(createdAt: string, nowMs: number): number {
  const ageMs = nowMs - new Date(createdAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  return 0.5 ** (ageMs / DAY_MS / HALF_LIFE_DAYS);
}

const StoredQuizSchema = z.object({
  dimensions: TasteDimensionsSchema.optional(),
});

export async function recomputeLearnedSignals(userId: string) {
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("interaction_events")
    .select("event_type, place_id, payload, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (!events || events.length === 0) return;

  const placeIds = [
    ...new Set(events.map((e) => e.place_id).filter((id): id is string => !!id)),
  ];
  const { data: places } = placeIds.length
    ? await admin
        .from("places")
        .select("id, area, vibe_tags")
        .in("id", placeIds)
    : { data: [] as { id: string; area: string | null; vibe_tags: string[] }[] };
  const placeById = new Map((places ?? []).map((p) => [p.id, p]));

  const now = Date.now();
  const vibeScores = new Map<string, number>();
  const areaScores = new Map<string, number>();
  const hourBuckets = { morning: 0, afternoon: 0, evening: 0, late_night: 0 };
  let queries = 0;
  let saves = 0;

  for (const event of events) {
    if (event.event_type === "query") queries += 1;
    if (event.event_type === "save") saves += 1;

    const weight =
      (EVENT_WEIGHTS[event.event_type] ?? 0) *
      recencyFactor(event.created_at, now);
    const place = event.place_id ? placeById.get(event.place_id) : undefined;
    if (weight !== 0 && place) {
      for (const tag of place.vibe_tags) {
        vibeScores.set(tag, (vibeScores.get(tag) ?? 0) + weight);
      }
      if (place.area && weight > 0) {
        areaScores.set(place.area, (areaScores.get(place.area) ?? 0) + weight);
      }
    }

    const hourIST = Number(
      new Date(event.created_at).toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        hour12: false,
      }),
    );
    if (hourIST >= 5 && hourIST < 12) hourBuckets.morning += 1;
    else if (hourIST >= 12 && hourIST < 17) hourBuckets.afternoon += 1;
    else if (hourIST >= 17 && hourIST < 23) hourBuckets.evening += 1;
    else hourBuckets.late_night += 1;
  }

  const sorted = [...vibeScores.entries()].sort((a, b) => b[1] - a[1]);
  const topVibes = sorted.filter(([, s]) => s > 0).slice(0, 8);
  const avoidVibes = sorted.filter(([, s]) => s < 0).slice(-5);
  const topAreas = [...areaScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([area]) => area);

  const learnedSignals = {
    updated_at: new Date().toISOString(),
    event_count: events.length,
    save_rate: queries > 0 ? Number((saves / queries).toFixed(2)) : null,
    top_vibes: topVibes.map(([tag, score]) => ({
      tag,
      score: Number(score.toFixed(2)),
    })),
    avoid_vibes: avoidVibes.map(([tag, score]) => ({
      tag,
      score: Number(score.toFixed(2)),
    })),
    top_areas: topAreas,
    active_hours: hourBuckets,
  };

  await admin
    .from("taste_profiles")
    .update({ learned_signals: learnedSignals, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  // Refresh the matching embedding with behavior blended in.
  if (!serverEnv().OPENAI_API_KEY) return;
  const { data: taste } = await admin
    .from("taste_profiles")
    .select("quiz_answers")
    .eq("user_id", userId)
    .single();
  const parsed = StoredQuizSchema.safeParse(taste?.quiz_answers);
  if (!parsed.success || !parsed.data.dimensions) return;

  const text = [
    tasteEmbeddingText(parsed.data.dimensions),
    topVibes.length > 0 &&
      `Lately drawn to: ${topVibes.map(([tag]) => tag).join(", ")}.`,
    avoidVibes.length > 0 &&
      `Lately avoiding: ${avoidVibes.map(([tag]) => tag).join(", ")}.`,
    topAreas.length > 0 && `Actually goes to: ${topAreas.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");
  const [embedding] = await getEmbeddings().embed([text]);

  await admin
    .from("taste_profiles")
    .update({ embedding: JSON.stringify(embedding) })
    .eq("user_id", userId);
}

/** Recompute when the rolling event count crosses the threshold. */
export async function maybeRecomputeLearnedSignals(userId: string) {
  try {
    if (!serverEnv().SUPABASE_SERVICE_ROLE_KEY) return;
    const admin = createAdminClient();
    const { count } = await admin
      .from("interaction_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (count && count % RECOMPUTE_EVERY === 0) {
      await recomputeLearnedSignals(userId);
    }
  } catch (error) {
    // Learning is best-effort; never let it break an interaction.
    console.error("learned-signals recompute failed:", error);
  }
}
