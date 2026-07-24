/**
 * Quorum resolution - the pure mirror of the SQL `aggregate_verdict` decision.
 * Only clean votes (geo_ok + independent + non-anomalous) are passed in as the
 * valid counts; this decides the bounty's next state.
 */

export type QuorumInput = {
  /** valid 'exists' votes (geo_ok && independent && !anomaly) */
  existsValid: number;
  /** valid 'not_exists' votes */
  rejectValid: number;
  /** total confirmations flagged anomalous */
  anomalies: number;
  quorumNeeded: number;
  quorumNeededReject: number;
  /** the bounty's current status, so 'hold' only fires from 'open' */
  currentStatus: "open" | "resolving";
};

/**
 * publish → quorum of exists reached;
 * reject  → (higher) quorum of not-exists reached;
 * hold    → anomalies present but no clean quorum yet (admin review);
 * pending → keep collecting votes.
 */
export type QuorumOutcome = "publish" | "reject" | "hold" | "pending";

export function resolveQuorum(input: QuorumInput): QuorumOutcome {
  if (input.existsValid >= input.quorumNeeded) return "publish";
  if (input.rejectValid >= input.quorumNeededReject) return "reject";
  if (input.anomalies > 0 && input.currentStatus === "open") return "hold";
  return "pending";
}
