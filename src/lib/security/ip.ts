/**
 * Client IP + rate-limit subject helpers (#116). Anonymous requests can't be
 * keyed by user id, so they're bounded by IP instead. Kept dependency-free
 * (no server-only) so it's unit-testable - it only reads request headers.
 *
 * Behind Vercel the client IP is the first hop of `x-forwarded-for`; we fall
 * back to `x-real-ip`. This is spoofable by a direct client, so it's a
 * best-effort abuse bound for anon reads, not an identity.
 */
export function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  return real?.trim() || null;
}

/**
 * Rate-limit subject for a possibly-anonymous request: the user id when signed
 * in, else `ip:<addr>`. Prefix your feature name onto it, e.g.
 * `map-places:${rateLimitSubject(user, request)}`.
 */
export function rateLimitSubject(
  user: { id: string } | null,
  request: Request,
): string {
  if (user) return user.id;
  return `ip:${getClientIp(request) ?? "unknown"}`;
}
