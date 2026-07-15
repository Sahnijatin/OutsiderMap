import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderQuestReel } from "@/lib/reels/render";
import type { Database } from "@/types/database";

const MAX_ATTEMPTS = 3;
const STUCK_AFTER_MS = 15 * 60 * 1000;

/** Idempotent: one job per quest (unique index on quest_id). */
export async function enqueueReelJob(
  admin: SupabaseClient<Database>,
  questId: string,
  userId: string,
) {
  await admin
    .from("reel_jobs")
    .upsert(
      { quest_id: questId, user_id: userId },
      { onConflict: "quest_id", ignoreDuplicates: true },
    );
}

/**
 * Claim-and-render loop for the worker/cron. Requeues stuck jobs first,
 * then processes up to `limit` queued jobs. Returns a small report.
 */
export async function processReelJobs(
  admin: SupabaseClient<Database>,
  limit = 2,
) {
  // Requeue anything stuck in processing (crashed worker, timeout).
  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  await admin
    .from("reel_jobs")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("status", "processing")
    .lt("updated_at", stuckBefore);

  let done = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const job = await claimNext(admin);
    if (!job) break;
    try {
      await renderQuestReel(admin, job.quest_id);
      await admin
        .from("reel_jobs")
        .update({
          status: "done",
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      done += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = job.attempts + 1 >= MAX_ATTEMPTS;
      await admin
        .from("reel_jobs")
        .update({
          status: exhausted ? "failed" : "queued",
          error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed += 1;
      console.error(`reel job ${job.id} failed (attempt ${job.attempts + 1})`, err);
    }
  }
  return { done, failed };
}

/** Atomic claim: only one worker wins a queued row. */
async function claimNext(admin: SupabaseClient<Database>) {
  const { data: candidates } = await admin
    .from("reel_jobs")
    .select("id, quest_id, attempts")
    .eq("status", "queued")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(1);
  const candidate = candidates?.[0];
  if (!candidate) return null;

  const { data: claimed } = await admin
    .from("reel_jobs")
    .update({
      status: "processing",
      attempts: candidate.attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("id, quest_id, attempts");
  if (!claimed || claimed.length === 0) return null;
  return { ...claimed[0], attempts: candidate.attempts };
}
