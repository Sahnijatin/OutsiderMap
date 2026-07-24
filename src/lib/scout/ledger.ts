/**
 * Points-ledger math - pure mirror of the SQL derived balance. Balance counts
 * only confirmed rows; escrow is shown separately as pending.
 */

export type LedgerRow = {
  delta: number;
  status: "escrow" | "confirmed" | "clawed_back";
};

/** Confirmed balance = sum of deltas on confirmed rows. */
export function confirmedBalance(rows: readonly LedgerRow[]): number {
  return rows
    .filter((r) => r.status === "confirmed")
    .reduce((sum, r) => sum + r.delta, 0);
}

/** Escrowed (provisional) points, shown apart from the spendable balance. */
export function escrowedBalance(rows: readonly LedgerRow[]): number {
  return rows
    .filter((r) => r.status === "escrow")
    .reduce((sum, r) => sum + r.delta, 0);
}
