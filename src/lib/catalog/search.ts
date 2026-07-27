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

const KEYWORD_COLUMNS =
  "id, slug, name, area, category, price_level, vibe_tags, description, editor_note, hours, image_path";

/**
 * Embedding-free retrieval used when the embeddings provider is unavailable, so
 * a single OpenAI blip doesn't sink an entire chat turn. It ilike-matches the
 * ask across name/description/editor_note, then relaxes to a city-wide sample
 * if nothing hits. Ranking is intentionally coarse (no similarity signal) -
 * this is a graceful floor, not a replacement for semantic search.
 */
export async function keywordSearch(
  supabase: SupabaseClient<Database>,
  opts: {
    city: City;
    terms: string[];
    area?: string | null;
    budgetMax?: number | null;
    count?: number;
  },
): Promise<CatalogCandidate[]> {
  const count = opts.count ?? 24;
  const area =
    opts.area && opts.city.areas.includes(opts.area) ? opts.area : null;

  const cityScoped = () => {
    let q = supabase
      .from("places")
      .select(KEYWORD_COLUMNS)
      .eq("city", opts.city.slug)
      // Product law: only published, non-chain places surface - including on
      // this degraded fallback path (match_places applies the same filters).
      .eq("is_published", true)
      .eq("is_chain", false);
    if (opts.budgetMax != null) q = q.lte("price_level", opts.budgetMax);
    return q;
  };

  // PostgREST's or() uses commas/parens as grammar; strip them from terms so a
  // stray punctuation mark can't break the filter or inject clauses.
  const terms = opts.terms
    .flatMap((t) => t.split(/\s+/))
    .map((t) => t.replace(/[,()*%]/g, "").trim())
    .filter((t) => t.length >= 3)
    .slice(0, 6);

  let q = cityScoped();
  if (area) q = q.eq("area", area);
  if (terms.length > 0) {
    const ors = terms.flatMap((t) => [
      `name.ilike.%${t}%`,
      `description.ilike.%${t}%`,
      `editor_note.ilike.%${t}%`,
    ]);
    q = q.or(ors.join(","));
  }

  const { data, error } = await q.limit(count);
  if (error) throw new Error(`keyword search failed: ${error.message}`);

  let rows = data ?? [];
  if (rows.length === 0 && (area || terms.length > 0)) {
    // Constraints over-narrowed; fall back to a city-wide sample so the turn
    // still has something to rank rather than dead-ending.
    const { data: relaxed, error: relaxedError } = await cityScoped().limit(
      count,
    );
    if (relaxedError) {
      throw new Error(`keyword search relax failed: ${relaxedError.message}`);
    }
    rows = relaxed ?? [];
  }

  return rows.map((r) => ({
    ...r,
    similarity: 0,
    hours: r.hours ?? null,
    image_path: r.image_path ?? null,
    open: isOpenNow(r.hours ?? null),
    openLabel: openStatusLabel(r.hours ?? null),
  }));
}
