import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getEmbeddings } from "@/lib/ai";
import { isEmbeddable, placeEmbeddingText } from "@/lib/places/embedding";
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
  /**
   * Rows refused by the quality floor, not attempted.
   *
   * Named "refused" rather than "skipped" because it is a decision, not an
   * accident - and because `EmbedSweepReport.skipped` already means something
   * else entirely (the whole sweep did not run). Counted apart from `failed`
   * for the same reason: a failure may work on the next attempt, a refusal
   * will not until someone writes a description or tags the place.
   */
  refused: number;
  /** A few refused ids, so a report can point at real rows. */
  refusedSample: string[];
};

/** Enough to go and look at, few enough to fit in a job report. */
const REFUSED_SAMPLE = 5;

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

  // The quality floor, applied before anything is spent. A row with nothing to
  // match on would embed to near the same vector as every other such row and
  // then compete for shortlist slots against places that can actually answer
  // the question - so it is refused here rather than ranked around later.
  // Filtering first also means the stubs cost no tokens.
  const refusedIds = rows.filter((r) => !isEmbeddable(r)).map((r) => r.id);
  const embeddable = rows.filter((r) => isEmbeddable(r));

  for (const batch of chunk(embeddable, batchSize)) {
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

  return {
    embedded,
    failed: failures.length,
    failures,
    refused: refusedIds.length,
    refusedSample: refusedIds.slice(0, REFUSED_SAMPLE),
  };
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
  /** Refused by the quality floor within the window this run scanned. */
  refused: number;
  /** Set when the sweep could not run at all (no OPENAI_API_KEY). */
  skipped?: string;
};

/**
 * How many rows to look at per unit of work actually done.
 *
 * Without this the sweep starves itself. Refused rows keep their null
 * embedding, so tomorrow's run selects the same ones, refuses them again, and
 * never reaches the good rows sitting behind them - a few hundred stubs at the
 * head of the queue would stop the net working at all, silently, while
 * reporting a cheerful zero failures every night.
 *
 * Overscanning is a mitigation, not a cure: if refusals outnumber the scan
 * window the backlog still needs enrichment rather than more sweeping, which
 * is what the refused count in the report is for.
 */
const SWEEP_OVERSCAN = 4;

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
    return { embedded: 0, failed: 0, refused: 0, skipped: "no OPENAI_API_KEY" };
  }

  const { data, error } = await admin
    .from("places")
    .select(EMBEDDABLE_COLUMNS)
    .eq("is_published", true)
    .is("embedding", null)
    .order("updated_at", { ascending: true })
    .limit(limit * SWEEP_OVERSCAN);
  if (error) throw new Error(error.message);

  const scanned = (data ?? []) as EmbeddableRow[];
  if (scanned.length === 0) return { embedded: 0, failed: 0, refused: 0 };

  // Split here rather than inside embedPlaceRows so the row cap applies to
  // work actually done: `limit` means "embed up to fifty", not "look at fifty
  // and embed whichever of them happened to be usable".
  const refused = scanned.filter((r) => !isEmbeddable(r));
  const embeddable = scanned.filter((r) => isEmbeddable(r)).slice(0, limit);

  const result =
    embeddable.length > 0
      ? await embedPlaceRows(admin, embeddable)
      : { embedded: 0, failed: 0, failures: [] as EmbedFailure[] };

  if (result.failures.length > 0) {
    console.error(
      "Embed sweep failures:",
      result.failures.slice(0, 5).map((f) => `${f.id}: ${f.error}`),
    );
  }
  if (refused.length > 0) {
    // Loud on purpose: these are published places invisible to chat and search
    // that no amount of sweeping will fix. They need words, not another run.
    console.warn(
      `Embed sweep refused ${refused.length} place(s) with nothing to match on:`,
      refused.slice(0, REFUSED_SAMPLE).map((r) => `${r.id} (${r.name})`),
    );
  }
  return {
    embedded: result.embedded,
    failed: result.failed,
    refused: refused.length,
  };
}
