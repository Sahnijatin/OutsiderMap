/**
 * Whether to offer "Continue with Google" on the web.
 *
 * The condition that actually matters - is the Google provider enabled in the
 * Supabase project? - cannot be read from a browser. Until this existed the
 * button simply always rendered, so on a deployment where the provider was
 * off, every visitor saw it and got a raw Supabase error string back.
 *
 * NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID is the honest proxy: it is the *same value*
 * you paste into Supabase -> Authentication -> Providers -> Google, so its
 * presence means someone did that work. Same shape as the native buttons,
 * which have gated on their client IDs since #151.
 *
 * NEXT_PUBLIC_GOOGLE_WEB_AUTH is the explicit override, for the two cases the
 * proxy gets wrong: web Google is on but you would rather not ship the client
 * ID in the bundle ("1"), or the client ID exists for the native apps while
 * the web provider is off ("0").
 *
 * Unset means off. That is the point - a gate that defaults to on would fix
 * nothing. See docs/AUTH-google.md.
 *
 * Deliberately a plain module: no "use client", no `server-only`. The
 * component that consumes it cannot be rendered in a test (the vitest harness
 * is a node environment with no DOM), so the decision has to be testable on
 * its own.
 */

export function resolveWebGoogleEnabled(env: {
  flag?: string | null;
  webClientId?: string | null;
}): boolean {
  const flag = env.flag?.trim().toLowerCase();
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return Boolean(env.webClientId?.trim());
}

export function isWebGoogleConfigured(): boolean {
  // Full static member expressions - Next.js only inlines NEXT_PUBLIC_* into
  // the client bundle when they are written out like this.
  return resolveWebGoogleEnabled({
    flag: process.env.NEXT_PUBLIC_GOOGLE_WEB_AUTH,
    webClientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}
