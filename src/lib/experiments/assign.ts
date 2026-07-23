/**
 * Deterministic A/B assignment (#120 part 2b). A member's variant is a pure
 * hash of `experiment:userId`, so it's stable across sessions with no
 * assignment table and no write on the serve path. Assignment lives only here
 * (server-side); the chosen variant is stamped into the answer_served payload,
 * so the metrics side reads it back from the event rather than re-deriving it.
 */

/** FNV-1a (32-bit) → a stable float in [0, 1). */
export function hashToUnit(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 makes it unsigned; divide by 2^32 for [0, 1).
  return (h >>> 0) / 0x100000000;
}

/**
 * Pick a variant for (experiment, user). Equal split across `variants`, in
 * order. Deterministic and stable. Throws on an empty variant list so a
 * misconfigured experiment fails loudly rather than serving `undefined`.
 */
export function assignVariant(
  experimentKey: string,
  userId: string,
  variants: readonly string[],
): string {
  if (variants.length === 0) {
    throw new Error(`experiment ${experimentKey} has no variants`);
  }
  const u = hashToUnit(`${experimentKey}:${userId}`);
  const idx = Math.min(variants.length - 1, Math.floor(u * variants.length));
  return variants[idx];
}
