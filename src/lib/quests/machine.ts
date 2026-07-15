import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/types/database";

/**
 * Typed wrappers around the quest state-machine RPCs (migration 12). All
 * transitions live in the database - these just shape errors and results.
 */

export async function startQuest(
  supabase: SupabaseClient<Database>,
  questId: string,
) {
  const { error } = await supabase.rpc("start_quest", {
    p_quest_id: questId,
  });
  if (error) throw new Error(friendly(error.message));
}

export async function completeStop(
  supabase: SupabaseClient<Database>,
  stopId: string,
  requireMedia: boolean,
) {
  const { data, error } = await supabase.rpc("complete_quest_stop", {
    p_stop_id: stopId,
    p_require_media: requireMedia,
  });
  if (error) throw new Error(friendly(error.message));
  const row = data?.[0];
  return {
    questCompleted: row?.quest_completed ?? false,
    nextStopId: row?.next_stop_id ?? null,
  };
}

/** Postgres RAISE messages read fine to humans; trim the noise if any. */
function friendly(message: string) {
  return message.replace(/^.*?:\s*/, "").trim() || message;
}

export type QuestStopDetail = Tables<"quest_stops"> & {
  place: {
    id: string;
    slug: string;
    name: string;
    area: string | null;
    kind: string;
    image_path: string | null;
    lat: number | null;
    lng: number | null;
    editor_note: string | null;
  } | null;
  media_count: number;
};

export type QuestDetail = Tables<"quests"> & { stops: QuestStopDetail[] };

/** Full quest with ordered stops, joined place info, and media counts. */
export async function getQuestDetail(
  supabase: SupabaseClient<Database>,
  questId: string,
): Promise<QuestDetail | null> {
  const { data: quest } = await supabase
    .from("quests")
    .select("*")
    .eq("id", questId)
    .maybeSingle();
  if (!quest) return null;

  const { data: stops } = await supabase
    .from("quest_stops")
    .select(
      "*, place:places(id, slug, name, area, kind, image_path, lat, lng, editor_note)",
    )
    .eq("quest_id", questId)
    .order("position");

  const stopIds = (stops ?? []).map((s) => s.id);
  const counts = new Map<string, number>();
  if (stopIds.length > 0) {
    const { data: media } = await supabase
      .from("quest_stop_media")
      .select("stop_id")
      .in("stop_id", stopIds);
    for (const m of media ?? []) {
      counts.set(m.stop_id, (counts.get(m.stop_id) ?? 0) + 1);
    }
  }

  return {
    ...quest,
    stops: (stops ?? []).map((s) => ({
      ...(s as unknown as Tables<"quest_stops"> & {
        place: QuestStopDetail["place"];
      }),
      media_count: counts.get(s.id) ?? 0,
    })),
  } as QuestDetail;
}

export type { Json };
