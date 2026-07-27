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

export type QuestStopMedia = {
  id: string;
  storage_path: string;
  media_type: "image" | "video";
  url: string | null;
};

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
    google_place_id: string | null;
    editor_note: string | null;
  } | null;
  media_count: number;
  media: QuestStopMedia[];
};

export type QuestDetail = Tables<"quests"> & {
  stops: QuestStopDetail[];
};

/**
 * Full quest with ordered stops, joined place info, and captured media.
 * Pass `signUrls` (admin-backed) to attach short-lived display URLs; without
 * it, media rows come back with url: null.
 */
export async function getQuestDetail(
  supabase: SupabaseClient<Database>,
  questId: string,
  signUrls?: (paths: string[]) => Promise<Map<string, string>>,
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
      "*, place:places(id, slug, name, area, kind, image_path, lat, lng, google_place_id, editor_note)",
    )
    .eq("quest_id", questId)
    .order("position");

  const stopIds = (stops ?? []).map((s) => s.id);
  const mediaByStop = new Map<
    string,
    { id: string; storage_path: string; media_type: "image" | "video" }[]
  >();
  if (stopIds.length > 0) {
    const { data: media } = await supabase
      .from("quest_stop_media")
      .select("id, stop_id, storage_path, media_type")
      .in("stop_id", stopIds)
      .order("created_at");
    for (const m of media ?? []) {
      const list = mediaByStop.get(m.stop_id) ?? [];
      list.push({
        id: m.id,
        storage_path: m.storage_path,
        media_type: m.media_type,
      });
      mediaByStop.set(m.stop_id, list);
    }
  }

  const allPaths = [...mediaByStop.values()].flat().map((m) => m.storage_path);
  const urls = signUrls && allPaths.length > 0
    ? await signUrls(allPaths)
    : new Map<string, string>();

  return {
    ...quest,
    stops: (stops ?? []).map((s) => {
      const media = (mediaByStop.get(s.id) ?? []).map((m) => ({
        ...m,
        url: urls.get(m.storage_path) ?? null,
      }));
      return {
        ...(s as unknown as Tables<"quest_stops"> & {
          place: QuestStopDetail["place"];
        }),
        media_count: media.length,
        media,
      };
    }),
  } as QuestDetail;
}

export type { Json };
