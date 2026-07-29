import type { LocationPrecision } from "@/lib/feed/model";
import type { PostPlace } from "@/lib/feed/read";

/**
 * Personal safety (#122): apply a post's `location_precision` before the post
 * leaves the server, so an exact venue is never shipped to the client for a
 * post the author chose to keep coarse. Applied uniformly (author included) —
 * safe-by-default beats a per-viewer exception that could leak via a shared
 * screen. The precision flag was dead metadata on read until this.
 *
 *   exact  → the pinned place + its area (what the author chose to reveal).
 *   area   → drop the exact place; show only the neighbourhood.
 *   hidden → reveal neither the place nor the area.
 *
 * The neighbourhood prefers the post's own `area` text, then the place's area.
 */
export type ResolvedLocation = { place: PostPlace; area: string | null };

export function resolvePostLocation(
  precision: LocationPrecision,
  place: PostPlace,
  postArea: string | null,
): ResolvedLocation {
  if (precision === "hidden") return { place: null, area: null };
  const area = postArea ?? place?.area ?? null;
  if (precision === "area") return { place: null, area };
  return { place: place ?? null, area };
}
