import { distanceMeters } from "./geo";

/**
 * Live-capture + anomaly heuristics. Mirrors the SQL checks in
 * `submit_confirmation` so the client can warn before submitting; the server
 * recomputes and stores the authoritative flags.
 */

/**
 * Where confirmation evidence lives. The client uploads straight to this
 * bucket under the caller-owned prefix below (storage RLS enforces the
 * owner segment on insert), and the confirm route accepts nothing else -
 * so a submitted {bucket, path} can never point at somebody else's object.
 */
export const SCOUT_EVIDENCE_BUCKET = "quest-media";

/** The only path prefix the confirm route accepts as this member's evidence. */
export function scoutEvidencePrefix(userId: string): string {
  return `scout/${userId}/`;
}

/** A capture must be no older than this many minutes (live, not gallery). */
export const CAPTURE_FRESH_MINUTES = 20;
/** Small tolerance for device clock skew into the future. */
export const CAPTURE_FUTURE_SKEW_MINUTES = 2;
/** Above this ground speed between a validator's captures is impossible. */
export const IMPOSSIBLE_SPEED_KMH = 120;

/** Confirmation evidence must be a live camera capture, never a gallery pick. */
export function isLiveCapture(media: unknown): boolean {
  return (
    typeof media === "object" &&
    media !== null &&
    (media as { source?: unknown }).source === "camera"
  );
}

/** Whether the capture timestamp is recent enough to be a live capture. */
export function isCaptureFresh(capturedAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(capturedAtMs)) return false;
  if (capturedAtMs > nowMs + CAPTURE_FUTURE_SKEW_MINUTES * 60_000) return false;
  return capturedAtMs >= nowMs - CAPTURE_FRESH_MINUTES * 60_000;
}

/**
 * Impossible-travel check between a validator's previous capture and this one:
 * distance / elapsed time above IMPOSSIBLE_SPEED_KMH is physically impossible
 * and marks the confirmation anomalous.
 */
export function isImpossibleTravel(
  prev: { lat: number; lng: number; atMs: number },
  curr: { lat: number; lng: number; atMs: number },
): boolean {
  const hours = Math.abs(curr.atMs - prev.atMs) / 3_600_000;
  if (hours <= 0) return true; // two captures at the same instant, far apart
  const km = distanceMeters(prev.lat, prev.lng, curr.lat, curr.lng) / 1000;
  return km / hours > IMPOSSIBLE_SPEED_KMH;
}
