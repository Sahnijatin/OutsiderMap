/**
 * Auth-cookie lifetime (#116). Supabase's SSR client writes session cookies as
 * browser cookies; without an explicit maxAge they behave more like session
 * cookies and returning visitors can land signed out. We pin a 60-day window,
 * refreshed on every visit by the proxy — so an active user stays signed in
 * across browser restarts, while the short access token still rotates hourly.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days
