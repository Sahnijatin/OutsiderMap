import { z } from "zod";

/**
 * Pure moderation-domain model: a faithful TS mirror of the enums and the
 * case/trust-state semantics in migration 0024_moderation. No IO, so it
 * unit-tests cleanly and gives the pipelines + admin desk one source of truth.
 * RLS in the migration is the real gate; this is a spec + second line.
 */

export const TARGET_TYPES = [
  "post",
  "comment",
  "reel",
  "profile",
  "submission",
  "price_report",
] as const;
export const CASE_SOURCES = ["pre_publish", "report", "rescan"] as const;
export const CASE_DECISIONS = [
  "auto_approved",
  "auto_rejected",
  "needs_review",
  "approved",
  "removed",
  "escalated",
] as const;
export const TRUST_TIERS = ["new", "member", "trusted", "restricted"] as const;

export type TargetType = (typeof TARGET_TYPES)[number];
export type CaseSource = (typeof CASE_SOURCES)[number];
export type CaseDecision = (typeof CASE_DECISIONS)[number];
export type TrustTier = (typeof TRUST_TIERS)[number];

export const TargetTypeSchema = z.enum(TARGET_TYPES);
export const CaseDecisionSchema = z.enum(CASE_DECISIONS);

/** Decisions that resolve a case (no longer in the human queue). */
const RESOLVED_DECISIONS = new Set<CaseDecision>([
  "auto_approved",
  "auto_rejected",
  "approved",
  "removed",
]);

/** Decisions under which the content may be publicly visible. */
const PUBLIC_DECISIONS = new Set<CaseDecision>(["auto_approved", "approved"]);

/** A case still needs attention (queue) when unresolved. */
export function caseIsOpen(decision: CaseDecision): boolean {
  return !RESOLVED_DECISIONS.has(decision);
}

/** Only auto_approved/approved content is allowed to reach public visibility. */
export function isContentPublic(decision: CaseDecision): boolean {
  return PUBLIC_DECISIONS.has(decision);
}

/**
 * Queue ordering key: unresolved first, then by descending severity, then
 * oldest first (mirrors the moderation_cases_queue_idx intent). Returns a
 * tuple usable with a stable sort comparator.
 */
export function queueRank(c: {
  decision: CaseDecision;
  severity: number;
  created_at: string;
}): [number, number, number] {
  const open = caseIsOpen(c.decision) ? 0 : 1;
  return [open, -c.severity, new Date(c.created_at).getTime()];
}

export type TrustState = {
  tier: TrustTier;
  muted_until: string | null;
  banned_at: string | null;
};

/** Current enforcement standing for a member, evaluated at `nowMs`. */
export function enforcementState(
  trust: TrustState,
  nowMs: number,
): "banned" | "muted" | "active" {
  if (trust.banned_at) return "banned";
  if (trust.muted_until && new Date(trust.muted_until).getTime() > nowMs) {
    return "muted";
  }
  return "active";
}

/** Whether a member may currently post (not banned, not actively muted). */
export function canPost(trust: TrustState, nowMs: number): boolean {
  return enforcementState(trust, nowMs) === "active";
}
