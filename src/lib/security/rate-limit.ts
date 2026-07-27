import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Fixed-window rate limit backed by Upstash Redis (REST API, no SDK). Returns
 * true if the request is allowed.
 *
 * Failure posture depends on the environment:
 * - development/preview: no-op (allow) when Upstash isn't configured, and fail
 *   open on any infra error - a flaky cache must never lock out local work.
 * - production: fall back to the in-process sliding-window limiter below
 *   instead of unlimited. Per-instance state is imperfect on serverless (each
 *   warm lambda counts separately, and a cold start forgets), but a per-
 *   instance ceiling is strictly better than zero abuse protection when the
 *   Redis env vars are missing or Upstash is down.
 *
 * Implementation: INCR the key, and set its TTL only on the first hit of the
 * window (EXPIRE ... NX). The window resets once it elapses.
 */

function isProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

/** key -> ascending hit timestamps (ms) still inside their window. */
const memoryHits = new Map<string, number[]>();

/**
 * In-process sliding-window limiter - the production fallback when Upstash is
 * unconfigured or erroring. Exported for tests. Entries are pruned on access;
 * a key whose window has fully drained is deleted so the map can't grow with
 * dead keys.
 */
export function memoryRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  nowMs: number = Date.now(),
): boolean {
  const cutoff = nowMs - windowSeconds * 1000;
  // Opportunistic sweep: every call prunes a handful of other keys whose
  // windows fully drained, so idle keys can't accumulate on long-lived hosts.
  let swept = 0;
  for (const [k, hits] of memoryHits) {
    if (swept >= 8) break;
    swept += 1;
    if (k === key) continue;
    if (hits.length === 0 || hits[hits.length - 1] <= cutoff) {
      memoryHits.delete(k);
    }
  }
  const live = (memoryHits.get(key) ?? []).filter((t) => t > cutoff);
  if (live.length >= limit) {
    memoryHits.set(key, live);
    return false;
  }
  live.push(nowMs);
  memoryHits.set(key, live);
  return true;
}

/** Test hook: clear the in-process fallback state between cases. */
export function resetMemoryRateLimit(): void {
  memoryHits.clear();
}

/** What "allow" degrades to when Upstash can't answer. */
function degraded(key: string, limit: number, windowSeconds: number): boolean {
  return isProduction() ? memoryRateLimit(key, limit, windowSeconds) : true;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const env = serverEnv();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return degraded(key, limit, windowSeconds);

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSeconds), "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return degraded(key, limit, windowSeconds);
    const out = (await res.json()) as Array<{ result?: number }>;
    const count = out?.[0]?.result ?? 0;
    return count <= limit;
  } catch {
    return degraded(key, limit, windowSeconds);
  }
}
