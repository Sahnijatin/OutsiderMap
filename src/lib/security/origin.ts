import "server-only";

/**
 * Same-origin enforcement for cookie-authenticated writes (#148).
 *
 * Server Actions already get this from the framework: Next compares `Origin`
 * against `Host`/`X-Forwarded-Host` and aborts on a mismatch. Route handlers
 * get nothing - `/api/*` mutations have been relying on SameSite cookies alone.
 * SameSite=Lax is a strong default, but it is one browser-side control with
 * known edges (older browsers, and any future cookie set SameSite=None), and it
 * is the only thing standing between a cross-site POST and a state change made
 * with the victim's session. This is the second control.
 *
 * Deliberately mirrors Next's own Server Actions rule rather than inventing a
 * stricter one: the app already runs that exact comparison in production for
 * every action, so applying it to route handlers carries a risk profile that is
 * already proven rather than a new one.
 *
 * Bearer-authenticated requests are never checked - see `getApiContext`. A
 * token in an `Authorization` header is not attached ambiently by the browser,
 * so it cannot be forged cross-site, and the native app must keep working.
 */

/** Methods that cannot change state, so they are never worth blocking. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * `Sec-Fetch-Site` values that mean "this did not come from another site".
 *
 * `none` is a user-initiated load (typed URL, bookmark) with no initiator
 * document, so there is no attacker page in the picture. `same-origin` is the
 * app calling itself. Everything else - `same-site` included - is a different
 * origin: a subdomain an attacker controls is exactly the case a cookie scoped
 * to the parent domain would otherwise be sent to.
 */
const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

/**
 * True when this is a state-changing request that a browser initiated from a
 * different origin.
 *
 * Absence of both signals reads as allowed, and that is correct rather than
 * lenient: browsers always send `Origin` on a cross-origin write, so a request
 * carrying neither header is not a cross-origin browser request. It is curl, a
 * server-to-server call, or a native client - none of which can be made to
 * ride someone else's cookies.
 */
export function isCrossOriginWrite(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return !TRUSTED_FETCH_SITES.has(fetchSite.toLowerCase());

  // Pre-Sec-Fetch-Site browsers, and anything else that sends an Origin.
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const expected =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!expected) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // An unparseable Origin is not something a browser produces.
    return true;
  }

  // `X-Forwarded-Host` can carry a comma-separated chain through several
  // proxies; the first entry is the host the client actually asked for.
  const expectedHost = expected.split(",")[0]!.trim();
  return originHost !== expectedHost;
}
