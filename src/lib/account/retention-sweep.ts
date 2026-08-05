import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { eraseSubject } from "./erase";
import {
  planRetention,
  underageCutoffISO,
  type RetentionRule,
  type RetentionStep,
} from "./retention";
import { purgeDerivedData } from "@/lib/consent/withdraw";

/**
 * The executor for the retention plan, run once a day from /api/cron/daily.
 *
 * It folds into the existing daily job rather than getting its own schedule
 * because Vercel Hobby allows exactly two cron entries and both are taken -
 * scripts/check-vercel-config.mjs fails the build if a third appears. It also
 * runs LAST in that handler, so a slow sweep can never starve the ingest
 * retry or the embedding backfill.
 *
 * Bounded three ways: a per-rule batch, a total row budget across the run, and
 * a wall-clock deadline checked between steps. PostgREST has no
 * `delete ... limit`, so each step selects ids and then deletes by id - which
 * is what actually makes the batch a bound rather than a suggestion.
 */

type Admin = SupabaseClient<Database>;

export type SweepResult = {
  deleted: Record<string, number>;
  errors: string[];
  stoppedEarly: boolean;
};

async function runStep(
  admin: Admin,
  step: RetentionStep,
  errors: string[],
): Promise<number> {
  let query = admin
    .from(step.table)
    .select("id")
    .lt(step.column, step.cutoffISO)
    .limit(step.batch);

  // `days: 0` rules age on a column that is itself a deadline (expires_at),
  // and a null there means "never expires" - .lt() already excludes nulls.
  for (const [column, value] of Object.entries(step.where ?? {})) {
    query = query.eq(column, value as string);
  }

  const { data, error } = await query;
  if (error) {
    errors.push(`${step.table} select: ${error.message}`);
    return 0;
  }

  const ids = (data ?? []).map((row) => (row as unknown as { id: unknown }).id);
  if (ids.length === 0) return 0;

  const { error: deleteError } = await admin
    .from(step.table)
    .delete()
    .in("id", ids as never[]);
  if (deleteError) {
    errors.push(`${step.table} delete: ${deleteError.message}`);
    return 0;
  }

  return ids.length;
}

/**
 * Delete accounts refused for being under 18, once the refusal record has
 * served its purpose. Bounded hard - this calls the full erasure path per
 * account, including an auth deletion, and it is not the job of a daily sweep
 * to churn through hundreds of them.
 */
async function expireUnderageBlocks(
  admin: Admin,
  nowMs: number,
  errors: string[],
): Promise<number> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("blocked_reason", "underage")
    .lt("blocked_at", underageCutoffISO(nowMs))
    .limit(25);
  if (error) {
    errors.push(`underage expiry select: ${error.message}`);
    return 0;
  }

  let removed = 0;
  for (const row of data ?? []) {
    const result = await eraseSubject(
      admin,
      { userId: row.id, email: null },
      { method: "admin" },
    );
    if (result.errors.length > 0) {
      errors.push(`underage expiry ${row.id}: ${result.errors.join("; ")}`);
    } else {
      removed += 1;
    }
  }
  return removed;
}

/**
 * Finish any withdrawal whose purge did not complete.
 *
 * PATCH /api/profile records the consent first and purges second, and returns
 * the purge failure to the caller without reverting the record - the member's
 * wish is what matters, and a failed delete is our problem to finish, not
 * theirs to retry. This is where it gets finished.
 */
async function reconcileWithdrawnConsent(
  admin: Admin,
  errors: string[],
): Promise<number> {
  // Scan wide, repair narrow.
  //
  // Almost every withdrawn member is already clean, so a small scan window
  // would return the same clean rows every night (the query has no meaningful
  // order, so Postgres hands back roughly the same page each time) and a
  // member further down the table would never be reached. Scanning 500 and
  // capping the expensive work at 25 keeps the run bounded without starving
  // the tail.
  const SCAN = 500;
  const MAX_REPAIRS = 25;

  const { data, error } = await admin
    .from("consents")
    .select("user_id")
    .eq("purpose", "personalization")
    .eq("granted", false)
    .limit(SCAN);
  if (error) {
    errors.push(`consent reconciliation select: ${error.message}`);
    return 0;
  }

  let repaired = 0;
  for (const row of data ?? []) {
    if (repaired >= MAX_REPAIRS) break;
    const { count } = await admin
      .from("member_memory")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.user_id);
    const { count: eventCount } = await admin
      .from("interaction_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.user_id);

    if ((count ?? 0) === 0 && (eventCount ?? 0) === 0) continue;

    const result = await purgeDerivedData(admin, row.user_id, [
      "taste_derived",
      "member_memory",
      "interaction_events",
    ]);
    if (result.errors.length > 0) {
      errors.push(`reconcile ${row.user_id}: ${result.errors.join("; ")}`);
    } else {
      repaired += 1;
    }
  }
  return repaired;
}

export async function runRetentionSweep(
  admin: Admin,
  nowMs: number,
  opts: {
    deadlineMs?: number;
    rules?: readonly RetentionRule[];
    budget?: number;
  } = {},
): Promise<SweepResult> {
  const deleted: Record<string, number> = {};
  const errors: string[] = [];
  let stoppedEarly = false;

  const pastDeadline = () =>
    opts.deadlineMs != null && Date.now() > opts.deadlineMs;

  for (const step of planRetention(nowMs, opts.rules, opts.budget)) {
    if (pastDeadline()) {
      stoppedEarly = true;
      break;
    }
    const count = await runStep(admin, step, errors);
    if (count > 0) deleted[step.table] = (deleted[step.table] ?? 0) + count;
  }

  if (!pastDeadline()) {
    const underage = await expireUnderageBlocks(admin, nowMs, errors);
    if (underage > 0) deleted.underage_accounts = underage;
  } else {
    stoppedEarly = true;
  }

  if (!pastDeadline()) {
    const reconciled = await reconcileWithdrawnConsent(admin, errors);
    if (reconciled > 0) deleted.consent_reconciled = reconciled;
  } else {
    stoppedEarly = true;
  }

  // The audit row. Best-effort, and never the reason a sweep reports failure.
  const { error: logError } = await admin.from("retention_runs").insert({
    deleted,
    errors,
    stopped_early: stoppedEarly,
  });
  if (logError) {
    console.error("retention_runs write failed", { message: logError.message });
  }

  return { deleted, errors, stoppedEarly };
}
