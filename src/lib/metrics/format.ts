/**
 * Pure metric formatting/derivation (#120). No server imports so it's
 * unit-testable and reusable; the heavy aggregation lives in SQL.
 */

export type FunnelStage = { stage: string; n: number; ord: number };

/** Percentage of n over d, rounded; 0 when the denominator is 0 (never NaN). */
export function ratePct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

/** Display labels for the activation-funnel stage keys. */
export const FUNNEL_LABELS: Record<string, string> = {
  signed_up: "Signed up",
  onboarded: "Onboarded",
  first_ask: "Asked",
  first_accept: "Accepted an answer",
  returned: "Returned",
};

/**
 * The own-reason tile, which has three states rather than two.
 *
 * "No picks served yet" and "the metric is not deployed" both have no number to
 * show, and rendering either as 0% would read as a total personalization
 * collapse - the loudest possible false alarm on the one tile that measures how
 * often members get the shared editor note instead of a reason written for
 * them. `metrics_reason_source` is new, so on any deploy where code lands
 * before migrations the second case is real rather than theoretical.
 */
export function reasonSourceTile(
  reasons: { model: number; editorNote: number; degraded: number } | null,
): { value: string; sub: string; muted: boolean } {
  if (!reasons) {
    return { value: "-", sub: "metric not deployed yet", muted: true };
  }
  const total = reasons.model + reasons.editorNote;
  if (total === 0) {
    return { value: "-", sub: "awaiting picks", muted: true };
  }
  return {
    value: `${ratePct(reasons.model, total)}%`,
    sub: `${reasons.model}/${total} picks${
      reasons.degraded > 0 ? ` · ${reasons.degraded} degraded` : ""
    }`,
    muted: false,
  };
}

/** Each stage as a share of the top of the funnel (first stage) - for bar widths. */
export function funnelShares(
  stages: readonly FunnelStage[],
): { stage: string; n: number; pct: number }[] {
  const top = stages.length > 0 ? stages[0].n : 0;
  return stages.map((s) => ({ stage: s.stage, n: s.n, pct: ratePct(s.n, top) }));
}
