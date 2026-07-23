/**
 * Sanitize a post-sign-in "next" target (#116). Only same-origin relative paths
 * are allowed — never an absolute or protocol-relative URL from a query string
 * or cookie, which could bounce a freshly-authenticated user off-site. Pure, so
 * it's shared by the OAuth callback and unit-tested.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/map",
): string {
  if (!raw) return fallback;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return fallback;
}
