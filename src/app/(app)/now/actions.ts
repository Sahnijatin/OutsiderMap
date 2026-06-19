"use server";

import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { recommend, type RecommendResult } from "@/lib/now/recommend";
import { maybeRecomputeLearnedSignals } from "@/lib/taste/learn";
import { createClient } from "@/lib/supabase/server";

const QuerySchema = z.string().trim().min(2).max(500);

export async function askNow(rawQuery: string): Promise<RecommendResult> {
  const user = await requireUser();
  const query = QuerySchema.parse(rawQuery);
  const supabase = await createClient();

  const result = await recommend(user.id, query);

  // Log from day one - interaction_events is the learning loop's raw
  // material. after() keeps it off the response's critical path.
  after(async () => {
    await supabase.from("interaction_events").insert({
      user_id: user.id,
      event_type: "query",
      payload: {
        query,
        intent: JSON.parse(JSON.stringify(result.intent)),
        picks: result.picks.map((p) => p.place.slug),
      },
    });
  });

  return result;
}

export async function savePlace(placeId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("saved_places")
    .upsert({ user_id: user.id, place_id: placeId });
  if (error) throw new Error(error.message);

  after(async () => {
    await supabase.from("interaction_events").insert({
      user_id: user.id,
      event_type: "save",
      place_id: placeId,
    });
    await maybeRecomputeLearnedSignals(user.id);
  });
}

export async function unsavePlace(placeId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase
    .from("saved_places")
    .delete()
    .eq("user_id", user.id)
    .eq("place_id", placeId);

  after(async () => {
    await supabase.from("interaction_events").insert({
      user_id: user.id,
      event_type: "unsave",
      place_id: placeId,
    });
  });
}

export async function dismissPlace(placeId: string, query?: string) {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase.from("interaction_events").insert({
    user_id: user.id,
    event_type: "dismiss",
    place_id: placeId,
    payload: query ? { query } : {},
  });

  after(async () => {
    await maybeRecomputeLearnedSignals(user.id);
  });
}

export async function markVisited(placeId: string, rating?: 1 | -1) {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase.from("interaction_events").insert({
    user_id: user.id,
    event_type: rating ? "rate" : "visit",
    place_id: placeId,
    payload: rating ? { rating } : {},
  });

  after(async () => {
    await maybeRecomputeLearnedSignals(user.id);
  });
}
