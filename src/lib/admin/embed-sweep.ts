import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getEmbeddings } from "@/lib/ai";
import { placeEmbeddingText } from "@/lib/places/embedding";
import { serverEnv } from "@/lib/env";

/**
 * Embedding backfill for published places.
 *
 * `match_places` filters `embedding is not null`, so a published row without
 * an embedding is a bare map pin: invisible to chat, search and
 * recommendations. Two paths create exactly that row today: quorum publishes
 * from the scout economy (SQL flips is_published and cannot call OpenAI), and
 * any bulk publish that skipped the per-place editor. This module is the net
 * under both - the admin bulk-publish action embeds inline, and the daily
 * cron sweeps whatever still slipped through.
 *
 * The batch mechanics live in `embedRowsInBatches`, which takes its embed and
 * save functions as arguments so the failure-collection logic is unit
 * testable without a network or a database.
 */

type Admin = SupabaseClient<Database>;

/** The columns `placeEmbeddingText` reads, plus the id to write back to. */
export type EmbeddableRow = {
  id: string;
  name: string;
  category: string | null;
  area: string | null;
  vibe_tags: string[];
  description: string | null;
  editor_note: string | null;
  best_for: Database["public"]["Tables"]["places"]["Row"]["best_for"];
  price_level: number | null;
};

export const EMBEDDABLE_COLUMNS =
  "id, name, category, area, vibe_tags, description, editor_note, best_for, price_level";

/** One OpenAI call per batch; small enough to stay well inside request limits. */
export const EMBED_BATCH_SIZE = 32;

export type EmbedFailure = { id: string; error: string };

export type EmbedRunResult = {
  embedded: number;
  failed: number;
  failures: EmbedFailure[];
};

export function chunk<T>(rows: T[], size: number): T[][] {
  if (size <= 0) throw new Error(`chunk size must be positive, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Embed rows in batches, collecting per-row failures instead of dying on the
 * first one. A failed embeddings call fails that whole batch (every row in it
 * is recorded, later batches still run); a failed save fails only that row.
 */
export async function embedRowsInBatches(
  rows: EmbeddableRow[],
  opts: {
    batchSize?: number;
    embedTexts: (texts: string[]) => Promise<number[][]>;
    save: (id: string, embedding: number[]) => Promise<void>;
  },
): Promise<EmbedRunResult> {
  const batchSize = opts.batchSize ?? EMBED_BATCH_SIZE;
  let embedded = 0;
  const failures: EmbedFailure[] = [];

  for (const batch of chunk(rows, batchSize)) {
    let vectors: number[][];
    try {
      vectors = await opts.embedTexts(batch.map((r) => placeEmbeddingText(r)));
      if (vectors.length !== batch.length) {
        throw new Error(
          `expected ${batch.length} embeddings, got ${vectors.length}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const row of batch) failures.push({ id: row.id, error: message });
      continue;
    }

    for (let i = 0; i < batch.length; i += 1) {
      try {
        await opts.save(batch[i].id, vectors[i]);
        embedded += 1;
      } catch (err) {
        failures.push({
          id: batch[i].id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { embedded, failed: failures.length, failures };
}

/** Wire `embedRowsInBatches` to the real embeddings API and places table. */
export async function embedPlaceRows(
  admin: Admin,
  rows: EmbeddableRow[],
): Promise<EmbedRunResult> {
  return embedRowsInBatches(rows, {
    embedTexts: (texts) => getEmbeddings().embed(texts),
    save: async (id, embedding) => {
      const { error } = await admin
        .from("places")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
  });
}

export type EmbedSweepReport = {
  embedded: number;
  failed: number;
  /** Set when the sweep could not run at all (no OPENAI_API_KEY). */
  skipped?: string;
};

/**
 * The cron safety net: find published places with no embedding and give them
 * one, up to `limit` per run. Skips gracefully when embeddings are not
 * configured - a report that says so beats a stack trace in the cron log.
 */
export async function sweepPublishedWithoutEmbeddings(
  admin: Admin,
  limit = 50,
): Promise<EmbedSweepReport> {
  if (!serverEnv().OPENAI_API_KEY) {
    return { embedded: 0, failed: 0, skipped: "no OPENAI_API_KEY" };
  }

  const { data, error } = await admin
    .from("places")
    .select(EMBEDDABLE_COLUMNS)
    .eq("is_published", true)
    .is("embedding", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as EmbeddableRow[];
  if (rows.length === 0) return { embedded: 0, failed: 0 };

  const result = await embedPlaceRows(admin, rows);
  if (result.failures.length > 0) {
    console.error(
      "Embed sweep failures:",
      result.failures.slice(0, 5).map((f) => `${f.id}: ${f.error}`),
    );
  }
  return { embedded: result.embedded, failed: result.failed };
}
