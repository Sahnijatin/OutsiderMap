import "server-only";
import { getEmbeddings } from "@/lib/ai";
import type { Json } from "@/types/database";

type EmbeddablePlace = {
  name: string;
  category: string | null;
  area: string | null;
  vibe_tags: string[];
  description: string | null;
  editor_note: string | null;
  best_for: Json | null;
  price_level: number | null;
};

/**
 * The text a place is matched on. Must stay in sync with
 * scripts/seed-places.mjs (kept standalone so it can run without Next).
 */
export function placeEmbeddingText(place: EmbeddablePlace) {
  const bestFor = (place.best_for ?? {}) as {
    moods?: string[];
    times?: string[];
    group?: string[];
  };
  return [
    `${place.name} - ${place.category ?? "place"} in ${place.area ?? "Delhi"}, Delhi.`,
    place.vibe_tags.length > 0 && `Vibe: ${place.vibe_tags.join(", ")}.`,
    place.description,
    place.editor_note,
    bestFor.moods?.length && `Best for moods: ${bestFor.moods.join(", ")}.`,
    (bestFor.times?.length || bestFor.group?.length) &&
      `Best times: ${(bestFor.times ?? []).join(", ")}. Groups: ${(bestFor.group ?? []).join(", ")}.`,
    place.price_level && `Price level ${place.price_level} of 4.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function embedPlace(place: EmbeddablePlace) {
  const [embedding] = await getEmbeddings().embed([placeEmbeddingText(place)]);
  return embedding;
}
