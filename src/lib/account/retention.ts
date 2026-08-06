import type { TableName } from "./personal-data";

/**
 * DPDP §8(7): storage limitation, enforced rather than promised.
 *
 * /privacy said operational data "ages out on a rolling basis". Nothing aged
 * out. There was no retention job at all - src/app/api/cron/ held exactly two
 * routes, neither of which deleted anything. This module is that claim made
 * true, and the labels and reasons below are rendered verbatim on the privacy
 * page so the wording cannot drift from the behaviour: it IS the behaviour.
 *
 * The planner is pure and takes the clock as an argument (the sla.ts shape);
 * the executor lives in retention-sweep.ts and folds into /api/cron/daily,
 * because Vercel Hobby allows two cron jobs and both are already spoken for.
 */

export type RetentionRule = {
  table: TableName;
  /** The timestamp column aged on. */
  column: string;
  /** 0 means "already past" - for columns that are themselves a deadline. */
  days: number;
  /** Extra equality filters, e.g. only closed cases. */
  where?: Record<string, string | boolean | null>;
  /** Maximum rows removed per daily run. */
  batch: number;
  /** Rendered on /privacy. Written for a member, not a lawyer. */
  label: string;
  reason: string;
};

/** Ceiling across the whole sweep, so one huge table cannot eat the run. */
export const TOTAL_ROW_BUDGET = 5_000;

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    table: "interaction_events",
    column: "created_at",
    days: 400,
    batch: 500,
    label: "What you tapped, saved and skipped",
    reason:
      "Thirteen months, so a full year of seasons still informs your " +
      "recommendations, and nothing older does.",
  },
  {
    table: "member_memory",
    column: "expires_at",
    days: 0,
    batch: 500,
    label: "Facts the concierge was told were temporary",
    reason:
      "Some remembered facts are stamped with an expiry when they are " +
      "written - visiting from Bombay this week. They go when they expire.",
  },
  {
    table: "chat_messages",
    column: "created_at",
    days: 180,
    batch: 500,
    label: "Your conversations",
    reason:
      "Six months. The concierge only ever reads the last twenty messages of " +
      "one thread, so nothing older is doing any work.",
  },
  {
    table: "chat_threads",
    column: "updated_at",
    days: 180,
    batch: 200,
    label: "The conversations themselves",
    reason:
      "Six months, matching the messages inside them. Without this the " +
      "messages went and an empty titled thread stayed behind forever.",
  },
  {
    table: "activity_events",
    column: "created_at",
    days: 180,
    batch: 500,
    label: "Your activity feed",
    reason: "Six months. The feed only shows recent activity.",
  },
  {
    table: "notification_sends",
    // sent_at, not created_at - this table records a send, not a row birth.
    column: "sent_at",
    days: 90,
    batch: 500,
    label: "A log of notifications we sent you",
    reason:
      "Ninety days, kept only to avoid sending you the same thing twice and " +
      "to debug a notification that did not arrive.",
  },
  {
    table: "retention_runs",
    column: "ran_at",
    days: 400,
    batch: 200,
    label: "The record of this cleanup running",
    reason: "Thirteen months of our own housekeeping log.",
  },
  {
    table: "moderation_cases",
    // resolved_at is the closed signal - it is null while a case is open, and
    // .lt() excludes nulls, so open cases are never swept. There is no
    // `status` column on this table; the field is `decision`.
    column: "resolved_at",
    days: 1095,
    batch: 200,
    label: "Closed moderation decisions",
    reason:
      "Three years, which is the retention the IT Rules 2021 require for " +
      "moderation records. Open cases are never deleted.",
  },
  {
    table: "grievances",
    column: "resolved_at",
    days: 1095,
    batch: 200,
    label: "Resolved grievances",
    reason:
      "Three years, as the statutory grievance register requires. Open " +
      "grievances are never swept.",
  },
];

/**
 * Deliberately never swept while the account lives:
 *
 *   consents, consent_events  the record of lawful basis. Deleting the proof
 *                             that consent was given would defeat the purpose
 *                             of collecting it. They die with the account.
 *   taste_profiles            not a log; the current state of one row.
 *   saved_places, posts,      things the member made. Theirs to delete.
 *   quests, weekend_plans
 *   erasure_log               the proof an erasure happened.
 */

export type RetentionStep = {
  table: TableName;
  column: string;
  cutoffISO: string;
  batch: number;
  where?: Record<string, string | boolean | null>;
};

/**
 * Turn the rules into dated work, stopping once the budget is spent.
 *
 * Rules are dropped whole rather than part-filled: a half-swept table on one
 * day and the rest on the next is the same outcome, and keeping batches intact
 * makes the run log readable.
 */
export function planRetention(
  nowMs: number,
  rules: readonly RetentionRule[] = RETENTION_RULES,
  budget: number = TOTAL_ROW_BUDGET,
): RetentionStep[] {
  const steps: RetentionStep[] = [];
  let remaining = budget;

  for (const rule of rules) {
    if (remaining < rule.batch) break;
    remaining -= rule.batch;
    steps.push({
      table: rule.table,
      column: rule.column,
      cutoffISO: new Date(nowMs - rule.days * 86_400_000).toISOString(),
      batch: rule.batch,
      where: rule.where,
    });
  }

  return steps;
}

/** How long an underage refusal record is kept before the account is removed. */
export const UNDERAGE_RECORD_DAYS = 30;

/**
 * The cutoff for deleting blocked-underage accounts.
 *
 * This is what makes "block, don't delete" (migration 58) defensible rather
 * than lazy: we keep the refusal long enough to be able to demonstrate it and
 * to stop an immediate retry with a different date, and no longer. Without it
 * we would be holding a permanent file on a minor - the precise thing §9 is
 * about.
 */
export function underageCutoffISO(nowMs: number): string {
  return new Date(nowMs - UNDERAGE_RECORD_DAYS * 86_400_000).toISOString();
}
