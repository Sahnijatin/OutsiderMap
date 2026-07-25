"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import {
  importOvertureBatch,
  resolvePlaceIdsBatch,
  type BatchResult,
} from "@/lib/admin/jobs";

/**
 * Server actions behind the Data tab.
 *
 * Each returns a BatchResult so the page can show what happened and how much
 * is left, rather than the operator having to guess whether a click did
 * anything.
 */

export type JobOutcome = BatchResult & { error?: string };

async function run(job: () => Promise<BatchResult>): Promise<JobOutcome> {
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
