/**
 * Sign-in failures, in the app's own words.
 *
 * Every failure path used to render `error.message` straight from Supabase, so
 * a member could be shown "Unsupported provider: provider is not enabled" -
 * which is true, useless, and tells them nothing about what to do instead.
 *
 * The mapper never returns its input. Whatever comes in - a Supabase string, a
 * URL, a stack fragment - what comes out is one of the lines below.
 */

const DEFAULT = "Sign-in didn't go through. Try again.";

const RULES: { match: RegExp; copy: string }[] = [
  {
    // The one this whole change is about: the provider is off in Supabase.
    match: /provider is not enabled|unsupported provider|provider.*disabled/i,
    copy: "Google sign-in isn't switched on yet. Use the email code below.",
  },
  {
    match: /cancel|closed|abort|dismiss|popup/i,
    copy: "That sign-in was cancelled. Start it again when you're ready.",
  },
  {
    match: /network|fetch|timeout|timed out|offline|connection/i,
    copy: "The network dropped mid-sign-in. Try again.",
  },
  {
    match: /rate|too many|429/i,
    copy: "Too many tries. Wait a minute, then start again.",
  },
  {
    match: /expired|invalid.*(code|token|otp)|(code|token|otp).*invalid/i,
    copy: "That code didn't match. Check the email and try again.",
  },
];

export function friendlyAuthError(raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return DEFAULT;
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.copy;
  }
  return DEFAULT;
}

/**
 * Copy for the `?error=` the OAuth callback redirects with.
 *
 * Google sends `?error=access_denied` with no code when someone backs out of
 * the consent screen. That is not a broken link, and telling them it was is
 * how you lose a member who simply changed their mind.
 */
export const AUTH_CALLBACK_ERRORS: Record<string, string> = {
  auth: "That sign-in link didn't work. Try again here.",
  cancelled: "You backed out of that sign-in. No harm done - try again.",
  config: "Google sign-in isn't switched on yet. Use the email code below.",
};

export function callbackErrorCopy(code: string | null | undefined): string {
  if (!code) return AUTH_CALLBACK_ERRORS.auth;
  return AUTH_CALLBACK_ERRORS[code] ?? AUTH_CALLBACK_ERRORS.auth;
}
