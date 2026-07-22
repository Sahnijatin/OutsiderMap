import {
  type CategoryScores,
  type ModerationCategory,
  type ModerationDecision,
} from "./types";

/**
 * The confidence-banded decision engine (pure). Maps normalized category
 * scores to auto_approve / auto_reject / needs_review, mirroring the
 * ingestion classifier. Safety-critical categories hard-block on even a low
 * score and are never optimistic.
 */

/** Never optimistic: any real signal here is an immediate hard block. */
export const SAFETY_CRITICAL: readonly ModerationCategory[] = [
  "csam",
  "sexual_minors",
  "violence_threat",
  "self_harm_intent",
  "non_consensual_intimate",
];

const SAFETY_THRESHOLD = 0.3; // low bar: safety-critical blocks early
const APPROVE_BELOW = 0.2; // clearly safe
const REJECT_AT = 0.8; // clearly violating

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Decide from normalized scores. Empty/absent scores → clearly safe. */
export function decide(scores: CategoryScores): ModerationDecision {
  const entries = Object.entries(scores) as [ModerationCategory, number][];

  const critical = entries.filter(
    ([c, s]) => SAFETY_CRITICAL.includes(c) && s >= SAFETY_THRESHOLD,
  );
  if (critical.length > 0) {
    return {
      action: "auto_reject",
      categories: critical.map(([c]) => c),
      confidence: 1,
      severity: 100,
      reason: "safety-critical category",
    };
  }

  const max = entries.reduce((m, [, s]) => Math.max(m, s), 0);
  const flagged = entries.filter(([, s]) => s >= APPROVE_BELOW).map(([c]) => c);

  if (max >= REJECT_AT) {
    return {
      action: "auto_reject",
      categories: flagged,
      confidence: clamp01((max - REJECT_AT) / (1 - REJECT_AT)),
      severity: Math.round(60 + max * 40),
    };
  }
  if (max < APPROVE_BELOW) {
    return {
      action: "auto_approve",
      categories: [],
      confidence: clamp01(1 - max / APPROVE_BELOW),
      severity: 0,
    };
  }
  // The uncertain middle band → a human looks. Confidence peaks (low) at the
  // midpoint between the two thresholds.
  const mid = (APPROVE_BELOW + REJECT_AT) / 2;
  return {
    action: "needs_review",
    categories: flagged,
    confidence: clamp01(1 - Math.abs(max - mid) / (REJECT_AT - mid)) * 0.5,
    severity: Math.round(20 + max * 50),
  };
}

const ACTION_RANK: Record<ModerationDecision["action"], number> = {
  auto_reject: 2,
  needs_review: 1,
  auto_approve: 0,
};

/**
 * Combine decisions from several passes (e.g. text + image). The most severe
 * action wins; categories union; severity is the max. A single hard block
 * anywhere blocks the whole item.
 */
export function mergeDecisions(
  decisions: ModerationDecision[],
): ModerationDecision {
  if (decisions.length === 0) {
    return { action: "auto_approve", categories: [], confidence: 1, severity: 0 };
  }
  const worst = decisions.reduce((a, b) =>
    ACTION_RANK[b.action] > ACTION_RANK[a.action] ? b : a,
  );
  const categories = [...new Set(decisions.flatMap((d) => d.categories))];
  const severity = decisions.reduce((m, d) => Math.max(m, d.severity), 0);
  return {
    action: worst.action,
    categories,
    confidence: worst.confidence,
    severity,
    reason: worst.reason,
  };
}

/** Map a banded action to the initial moderation_cases.decision value. */
export function bandToCaseDecision(
  action: ModerationDecision["action"],
): "auto_approved" | "auto_rejected" | "needs_review" {
  if (action === "auto_approve") return "auto_approved";
  if (action === "auto_reject") return "auto_rejected";
  return "needs_review";
}
