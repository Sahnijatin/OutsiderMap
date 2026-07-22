/**
 * Numeric rupee budgets, mapped to the catalog's 1-4 price tier (#96). The
 * catalog stores only `price_level` (1-4), so "200 mein dinner" (₹200/head)
 * can't be represented directly - it becomes a tier ceiling here. Bands are a
 * product judgment for a per-head spend in Delhi; keep them in one place so the
 * mapping is consistent across search and planning.
 */

export type PriceTier = 1 | 2 | 3 | 4;

/** Upper rupee bound (per head) for each tier ceiling. */
const TIER_CEILINGS: Array<{ maxRupees: number; tier: PriceTier }> = [
  { maxRupees: 300, tier: 1 }, // street / budget
  { maxRupees: 700, tier: 2 }, // casual
  { maxRupees: 1500, tier: 3 }, // mid / upscale-casual
];

/**
 * Convert a per-head rupee budget to the highest price tier that still fits
 * within it. ₹200 -> 1, ₹500 -> 2, ₹1200 -> 3, ₹3000 -> 4. Non-positive or
 * non-finite input returns null (no ceiling).
 */
export function rupeesToTier(rupees: number): PriceTier | null {
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  for (const band of TIER_CEILINGS) {
    if (rupees <= band.maxRupees) return band.tier;
  }
  return 4;
}

/**
 * Combine an explicit tier ceiling and a rupee budget into a single price
 * ceiling, taking whichever is stricter (lower). Either may be absent.
 */
export function effectiveTier(
  tier: number | null | undefined,
  rupees: number | null | undefined,
): PriceTier | null {
  const fromRupees =
    typeof rupees === "number" ? rupeesToTier(rupees) : null;
  const fromTier =
    typeof tier === "number" && tier >= 1 && tier <= 4
      ? (Math.round(tier) as PriceTier)
      : null;
  if (fromRupees == null) return fromTier;
  if (fromTier == null) return fromRupees;
  return Math.min(fromTier, fromRupees) as PriceTier;
}
