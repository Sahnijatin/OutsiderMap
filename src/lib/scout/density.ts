/**
 * Density instrumentation (#114). Pure mirror of the SQL in
 * area_validator_density: an area can't form an independent verification quorum
 * unless it has enough eligible validators, so we measure per-city coverage and
 * flag the thin ones for the admin-verification fallback.
 *
 * Kept dependency-free (no server-only import) so it can be unit-tested and
 * reused on the client; the authoritative count runs in Postgres.
 */

/**
 * A city is "thin" below this many eligible validators — the default publish
 * quorum (bounty_quests.quorum_needed defaults to 2). Below it, independent
 * confirmations can't converge and a bounty would hang open forever, so the
 * admin fallback is the only way to resolve it.
 */
export const MIN_VALIDATORS_FOR_QUORUM = 2;

/** Per-city eligible-validator coverage, mirroring area_validator_density. */
export type AreaDensity = {
  city: string;
  openBounties: number;
  activeValidators: number;
  thin: boolean;
};

/**
 * Thin when the pool of eligible validators can't reach the publish quorum.
 * `minValidators` defaults to the publish quorum; pass a bounty's own
 * `quorum_needed` where it differs from the default.
 */
export function isThinDensity(
  activeValidators: number,
  minValidators: number = MIN_VALIDATORS_FOR_QUORUM,
): boolean {
  return activeValidators < minValidators;
}
