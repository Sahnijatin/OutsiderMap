/**
 * Pure statutory SLA clock for grievances (IT Rules 2021, amended 2023).
 * Acknowledge within 24h; resolve within 15 days — but non-consensual/intimate
 * imagery within 24h and court/government takedown orders within 36h. The exact
 * durations are confirmed with counsel (#91); this encodes the researched
 * defaults in one testable place.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type GrievanceCategory = string;

export const ACK_WINDOW_MS = 24 * HOUR;

/** Resolution window by category. */
export function resolveWindowMs(category: GrievanceCategory): number {
  if (category === "intimate_imagery") return 24 * HOUR;
  if (category === "court_order" || category === "govt_order") return 36 * HOUR;
  return 15 * DAY;
}

export type GrievanceClock = {
  ackBy: number;
  resolveBy: number;
  ackOverdue: boolean;
  resolveOverdue: boolean;
};

/** The statutory window to appeal a closed grievance to the GAC. */
export const APPEAL_WINDOW_MS = 30 * DAY;

/**
 * Whether a grievance can still be appealed at `nowMs`: it must be closed
 * (resolved/rejected) and within 30 days of that resolution. Mirrors the
 * appeal_grievance RPC's server-side rule so a UI can gate the affordance.
 */
export function appealWindowOpen(
  g: { status: string; resolved_at: string | null },
  nowMs: number,
): boolean {
  if (g.status !== "resolved" && g.status !== "rejected") return false;
  if (!g.resolved_at) return false;
  return nowMs - Date.parse(g.resolved_at) <= APPEAL_WINDOW_MS;
}

/** Deadlines + overdue flags for a grievance, evaluated at `nowMs`. */
export function slaStatus(
  g: {
    category: GrievanceCategory;
    received_at: string;
    acknowledged_at: string | null;
    resolved_at: string | null;
  },
  nowMs: number,
): GrievanceClock {
  const received = Date.parse(g.received_at);
  const ackBy = received + ACK_WINDOW_MS;
  const resolveBy = received + resolveWindowMs(g.category);
  return {
    ackBy,
    resolveBy,
    ackOverdue: !g.acknowledged_at && nowMs > ackBy,
    resolveOverdue: !g.resolved_at && nowMs > resolveBy,
  };
}
