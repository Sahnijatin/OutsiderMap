/**
 * Auth-cookie lifetime, and the member's choice about it.
 *
 * WHY THIS IS NOT `cookieOptions`. @supabase/ssr accepts a `cookieOptions`
 * object and then overrides the one field we care about:
 *
 *   const setCookieOptions = {
 *     ...DEFAULT_COOKIE_OPTIONS,
 *     ...options?.cookieOptions,
 *     maxAge: DEFAULT_COOKIE_OPTIONS.maxAge,   // re-applied AFTER the spread
 *   };
 *
 * (node_modules/@supabase/ssr/dist/module/cookies.js, in both the storage
 * setItem path and the server response flush). DEFAULT_COOKIE_OPTIONS.maxAge
 * is 400 days, so passing our own value there did nothing at all. The lifetime
 * has to be applied in our own `setAll` implementations instead - which is
 * what applySessionLifetime is for, and why proxy.ts / supabase/server.ts /
 * supabase/client.ts each call it.
 *
 * No `server-only` import here: the edge proxy, server components and the
 * browser client all need these.
 */

/** How long a "stay logged in" session lasts, refreshed on every visit. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

/** Records the member's choice. Read by the proxy on every request. */
export const SESSION_PREF_COOKIE = "om_session_pref";

/**
 * The preference must outlive the session it describes, or a returning
 * "session-only" member would silently be upgraded to persistent.
 */
export const SESSION_PREF_MAX_AGE_SECONDS = 60 * 60 * 24 * 400; // browser cap

export type SessionPersistence = "persistent" | "session";

/**
 * Absent or unrecognised means persistent, and that default is load-bearing
 * twice over:
 *
 *  - Migration. Every member signed in today has no preference cookie.
 *    Defaulting them to session-only would sign out the entire web user base
 *    on deploy.
 *  - Native. The Capacitor shell has no token storage and relies entirely on
 *    WebView cookie persistence, and it never writes this cookie. Defaulting
 *    to persistent is what guarantees the app keeps its session across
 *    restarts without any platform check inside the cookie writer.
 */
export function readSessionPersistence(
  raw: string | null | undefined,
): SessionPersistence {
  return raw === "session" ? "session" : "persistent";
}

/**
 * Rewrites the cookie options @supabase/ssr hands our `setAll`.
 *
 * Deletions pass through untouched. @supabase/ssr expires a cookie by setting
 * `maxAge: 0`, so stripping maxAge on that write would turn a sign-out into a
 * session cookie holding an empty value - the member would look signed out but
 * stale chunks would linger. This guard is the difference between sign-out
 * working and appearing to work.
 *
 * For a session-only choice the keys are REMOVED rather than set to undefined:
 * `cookie`'s serialize checks `maxAge !== undefined` and Next's edge cookies
 * check `"maxAge" in options`, so only absence produces a true browser-session
 * cookie in both sinks.
 */
export function applySessionLifetime<
  T extends { maxAge?: number; expires?: Date },
>(options: T, mode: SessionPersistence, value?: string): T {
  if (options.maxAge === 0 || value === "") return options;
  if (mode === "session") {
    const rest = { ...options };
    delete rest.maxAge;
    delete rest.expires;
    return rest;
  }
  return { ...options, maxAge: SESSION_COOKIE_MAX_AGE_SECONDS };
}

/**
 * The exact `document.cookie` string for the preference. Pure so the
 * attributes are testable.
 *
 * SameSite must stay Lax: Google's OAuth redirect back to /auth/callback is a
 * top-level cross-site GET, and under Strict the cookie would not be sent -
 * silently upgrading that member to persistent. Same reason om_auth_next uses
 * Lax.
 */
export function sessionPrefCookieString(
  mode: SessionPersistence,
  secure: boolean,
): string {
  return [
    `${SESSION_PREF_COOKIE}=${mode}`,
    "path=/",
    `max-age=${SESSION_PREF_MAX_AGE_SECONDS}`,
    "samesite=lax",
    ...(secure ? ["secure"] : []),
  ].join("; ");
}

/**
 * Where to land after an OAuth round trip.
 *
 * Google cannot carry our `?next` through its redirect, so the sign-in panel
 * stashes it here and /auth/callback reads it back. Ten minutes is longer than
 * any real consent screen and short enough that a stale value cannot redirect
 * a later sign-in somewhere unexpected.
 *
 * Lives here beside the preference cookie for two reasons: the writer and the
 * reader can no longer drift apart on the name, and `secure` is applied the
 * same way rather than being forgotten - which it was, so this cookie used to
 * travel unencrypted on https.
 *
 * SameSite must stay Lax for the same reason as above: the return from Google
 * is a top-level cross-site GET, and Strict would drop the cookie exactly when
 * it is needed.
 */
export const AUTH_NEXT_COOKIE = "om_auth_next";
export const AUTH_NEXT_MAX_AGE_SECONDS = 600;

export function authNextCookieString(next: string, secure: boolean): string {
  return [
    `${AUTH_NEXT_COOKIE}=${encodeURIComponent(next)}`,
    "path=/",
    `max-age=${AUTH_NEXT_MAX_AGE_SECONDS}`,
    "samesite=lax",
    ...(secure ? ["secure"] : []),
  ].join("; ");
}
