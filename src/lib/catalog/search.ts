import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOpenNow, openStatusLabel } from "@/lib/places/hours";
import type { City } from "@/lib/cities";
import type { Database, Json, MatchedPlace } from "@/types/database";

/**
 * The retrieval core shared by Right Now, chat, and quest generation:
 * blend query + taste embeddings, run match_places for a city, enrich the
 * shortlist with hours/images. Rerank/composition stays with the callers.
 */

const QUERY_WEIGHT = 0.65; // the ask outranks the standing profile

export type CatalogCandidate = MatchedPlace & {
  hours: Json | null;
  image_path: string | null;
  open: boolean | null;
  openLabel: string | null;
};

export function combineEmbeddings(
  query: number[],
  taste: number[] | null,
  queryWeight = QUERY_WEIGHT,
) {
  if (!taste || taste.length !== query.length) return query;
  const combined = query.map(
    (q, i) => q * queryWeight + taste[i] * (1 - queryWeight),
  );
  // Reduce loop avoids spreading 1536 args into Math.hypot; guard the
  // zero/degenerate-vector case so we never divide into a NaN embedding
  // (which would corrupt the match_places query).
  let sumSquares = 0;
  for (const v of combined) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0 || !Number.isFinite(norm)) return query;
  return combined.map((v) => v / norm);
}

/**
 * Stored taste embeddings are written as JSON-stringified number arrays.
 * Parse defensively: a malformed/corrupt column must degrade to "no taste
 * vector" rather than hard-fail the whole request.
 */
export function parseStoredEmbedding(raw: unknown): number[] | null {
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
    // Corrupt JSON - fall through to null.
  }
  return null;
}

export async function searchCatalog(
  supabase: SupabaseClient<Database>,
  opts: {
    city: City;
    queryEmbedding: number[];
    tasteEmbedding?: number[] | null;
    area?: string | null;
    budgetMax?: number | null;
    count?: number;
  },
): Promise<CatalogCandidate[]> {
  const combined = combineEmbeddings(
    opts.queryEmbedding,
    opts.tasteEmbedding ?? null,
  );
  const count = opts.count ?? 24;
  const area =
    opts.area && opts.city.areas.includes(opts.area) ? opts.area : null;

  const run = (filterArea: string | null) =>
    supabase.rpc("match_places", {
      query_embedding: JSON.stringify(combined),
      match_count: count,
      filter_city: opts.city.slug,
      filter_area: filterArea,
      max_price_level: opts.budgetMax ?? null,
    });

  const { data: matches, error } = await run(area);
  if (error) throw new Error(`match_places failed: ${error.message}`);
  let candidates = matches ?? [];
  if (candidates.length === 0 && area) {
    // Area filter can over-constrain; retry city-wide before giving up.
    const { data: retry, error: retryError } = await run(null);
    if (retryError) {
      throw new Error(`match_places retry failed: ${retryError.message}`);
    }
    candidates = retry ?? [];
  }
  if (candidates.length === 0) return [];

  // match_places keeps embeddings server-side and returns a slim row; pull
  // hours/images for the shortlist separately.
  const { data: details } = await supabase
    .from("places")
    .select("id, hours, image_path")
    .in(
      "id",
      candidates.map((c) => c.id),
    );
  const detailById = new Map(details?.map((d) => [d.id, d]) ?? []);

  return candidates.map((c) => {
    const detail = detailById.get(c.id);
    return {
      ...c,
      hours: detail?.hours ?? null,
      image_path: detail?.image_path ?? null,
      open: isOpenNow(detail?.hours ?? null),
      openLabel: openStatusLabel(detail?.hours ?? null),
    };
  });
}

/**
 * Soft open-now preference: drop closed places while at least `min` open/
 * unknown candidates remain, so downstream ranking still has range.
 */
export function preferOpen(candidates: CatalogCandidate[], min = 6) {
  const openish = candidates.filter((c) => c.open !== false);
  return openish.length >= min ? openish : candidates;
}
