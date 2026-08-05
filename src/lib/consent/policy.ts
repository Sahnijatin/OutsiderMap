/**
 * The one privacy-policy version constant.
 *
 * Before this there was none: /privacy said "the current version always lives
 * at this address", which is true and useless - it means no consent record can
 * name what was agreed to, and a policy change can never be detected.
 *
 * Deliberately not `server-only`: the marketing page, the setup notice, the
 * consent card and the export bundle all have to agree on this value, and two
 * of those are client components.
 */

/**
 * ISO date, so version ordering is lexicographic and chronological at once.
 * Bumping this is a deliberate act - see MATERIAL_POLICY_VERSIONS.
 */
export const PRIVACY_POLICY_VERSION = "2026-08-05";

export const PRIVACY_POLICY_EFFECTIVE = "2026-08-05T00:00:00.000Z";

/**
 * Versions that materially changed what a member agreed to.
 *
 * A typo fix bumps PRIVACY_POLICY_VERSION and is NOT listed here, so nobody is
 * re-prompted for a comma. Consent fatigue is a real failure mode: prompt for
 * everything and members click through without reading, which is precisely the
 * "unambiguous and informed" consent DPDP asks for, destroyed by over-asking.
 *
 * Newest last.
 */
export const MATERIAL_POLICY_VERSIONS = ["2026-08-05"] as const;

/**
 * The most recent material version at or before `current`.
 *
 * Members are re-prompted against this, not against the raw version, which is
 * what makes a cosmetic edit free.
 */
export function latestMaterialVersion(
  current: string = PRIVACY_POLICY_VERSION,
  material: readonly string[] = MATERIAL_POLICY_VERSIONS,
): string {
  let latest = "";
  for (const version of material) {
    if (version <= current && version > latest) latest = version;
  }
  // No material version at or before `current` means nothing has ever been
  // materially agreed to - treat the current version as the bar.
  return latest || current;
}

/**
 * Does this member need to see the notice again?
 *
 * Fails closed on purpose. null (never accepted), "legacy" (the backfill
 * marker from migration 57) and any unrecognised string all return true: if we
 * cannot prove what they agreed to, we ask. Guessing in the other direction is
 * how an unprovable consent becomes a claimed one.
 */
export function needsReconsent(
  accepted: string | null | undefined,
  current: string = PRIVACY_POLICY_VERSION,
  material: readonly string[] = MATERIAL_POLICY_VERSIONS,
): boolean {
  if (!accepted) return true;
  if (accepted === current) return false;
  // Anything that isn't a version we've ever published - "legacy", a typo, a
  // value from a future rollback - is not evidence of anything.
  if (!material.includes(accepted) && accepted !== current) return true;
  return accepted < latestMaterialVersion(current, material);
}
