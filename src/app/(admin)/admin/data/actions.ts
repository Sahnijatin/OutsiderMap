"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import {
  candidateSourceLinks,
  importOvertureBatch,
  resolvePlaceIdsBatch,
  type BatchResult,
} from "@/lib/admin/jobs";
import { enrichDraftsBatch } from "@/lib/admin/enrich";

/**
 * Server actions behind the Data tab.
 *
 * Each returns a BatchResult so the page can show what happened and how much
 * is left, rather than the operator having to guess whether a click did
 * anything.
 */

export type JobOutcome = BatchResult & {
  error?: string;
  /**
   * Scan-level progress for jobs where "wrote nothing" and "nothing left" are
   * different outcomes (enrichment declines by design). When present, the
   * runner keeps going while scanned > 0 and only says Done on a zero-scan
   * round.
   */
  progress?: { scanned: number; enriched: number; declined: number };
};

async function run(job: () => Promise<JobOutcome>): Promise<JobOutcome> {
  try {
    const result = await job();
    revalidatePath("/admin/data");
    return result;
  } catch (err) {
    return {
      processed: 0,
      remaining: 0,
      notes: [],
      error: err instanceof Error ? err.message : "Something went wrong.",
    };
  }
}

export async function importOvertureAction(): Promise<JobOutcome> {
  await requireAdmin();
  return run(() => importOvertureBatch(createAdminClient(), { city: "delhi" }));
}

export async function resolvePlaceIdsAction(): Promise<JobOutcome> {
  await requireAdmin();
  const apiKey = serverEnv().GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return {
      processed: 0,
      remaining: 0,
      notes: [],
      error:
        "Set GOOGLE_MAPS_API_KEY in Vercel (Places API New must be enabled), then redeploy.",
    };
  }
  return run(() => resolvePlaceIdsBatch(createAdminClient(), { apiKey }));
}

export async function enrichDraftsAction(): Promise<JobOutcome> {
  await requireAdmin();
  const env = serverEnv();
  if (!env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY) {
    return {
      processed: 0,
      remaining: 0,
      notes: [],
      error:
        "Set OPENAI_API_KEY or ANTHROPIC_API_KEY in Vercel, then redeploy.",
    };
  }
  return run(async () => {
    const links = await candidateSourceLinks();
    const out = await enrichDraftsBatch(createAdminClient(), {
      city: "delhi",
      links,
    });
    return {
      processed: out.enriched,
      remaining: out.remaining,
      notes: out.notes,
      progress: {
        scanned: out.scanned,
        enriched: out.enriched,
        declined: out.declined,
      },
    };
  });
}
