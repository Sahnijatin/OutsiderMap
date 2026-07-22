/**
 * Pure CSAM-report state machine. The workflow is legally load-bearing:
 * detected → preserved (evidence retained) → reported (to SJPU/police) →
 * closed. Only forward transitions are legal.
 */
export const CSAM_STATUSES = ["detected", "preserved", "reported", "closed"] as const;
export type CsamStatus = (typeof CSAM_STATUSES)[number];

const ORDER: Record<CsamStatus, number> = {
  detected: 0,
  preserved: 1,
  reported: 2,
  closed: 3,
};

/** A transition is legal only if it moves forward (or stays put). */
export function canAdvanceCsam(from: CsamStatus, to: CsamStatus): boolean {
  return ORDER[to] >= ORDER[from];
}

/** The next status in the workflow, or the same if already closed. */
export function nextCsamStatus(current: CsamStatus): CsamStatus {
  const i = ORDER[current];
  return i >= 3 ? "closed" : CSAM_STATUSES[i + 1];
}
