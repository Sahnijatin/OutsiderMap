/**
 * Last-known-location cache (#116). Seeds the map instantly on load without a
 * geolocation prompt, and lets us only auto-locate when permission was already
 * granted. The parse is pure (unit-tested); the read/write wrappers touch
 * localStorage and are safe to call during SSR (they no-op without `window`).
 */

export const LOCATION_CACHE_KEY = "om:last-location";
/** A week — stale enough that we don't drop someone across town on a cold open. */
export const LOCATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedLocation = { lat: number; lng: number; at: number };

export function parseCachedLocation(
  raw: string | null,
  nowMs: number,
  ttlMs: number = LOCATION_CACHE_TTL_MS,
): CachedLocation | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CachedLocation>;
    if (
      typeof v?.lat === "number" &&
      typeof v?.lng === "number" &&
      typeof v?.at === "number" &&
      Number.isFinite(v.lat) &&
      Number.isFinite(v.lng)
    ) {
      if (nowMs - v.at > ttlMs) return null;
      return { lat: v.lat, lng: v.lng, at: v.at };
    }
  } catch {
    // corrupt entry — treat as no cache
  }
  return null;
}

export function readCachedLocation(nowMs: number): CachedLocation | null {
  if (typeof window === "undefined") return null;
  try {
    return parseCachedLocation(
      window.localStorage.getItem(LOCATION_CACHE_KEY),
      nowMs,
    );
  } catch {
    return null;
  }
}

export function writeCachedLocation(lat: number, lng: number, at: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LOCATION_CACHE_KEY,
      JSON.stringify({ lat, lng, at }),
    );
  } catch {
    // private mode / quota — a cache miss is harmless
  }
}
