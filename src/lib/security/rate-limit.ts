import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Fixed-window rate limit backed by Upstash Redis (REST API, no SDK). Returns
 * true if the request is allowed. No-ops (allows) when Upstash isn't
 * configured, and fails open on any infra error — a flaky cache must never
 * lock out real users.
 *
 * Implementation: INCR the key, and set its TTL only on the first hit of the
 * window (EXPIRE ... NX). The window resets once it elapses.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const env = serverEnv();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true;

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
    if (!res.ok) return true;
    const out = (await res.json()) as Array<{ result?: number }>;
    const count = out?.[0]?.result ?? 0;
    return count <= limit;
  } catch {
    return true;
  }
}
