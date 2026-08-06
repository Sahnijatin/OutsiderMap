import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/next-path";
import { AUTH_NEXT_COOKIE } from "@/lib/auth/session";

/** OAuth/magic-link landing: exchanges the code for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Prefer an explicit ?next; else the cookie the sign-in flow stashes before an
  // OAuth redirect (Google can't carry ?next). Sanitized to a relative path.
  // The cookie name comes from the module that writes it, so the two halves of
  // this handshake cannot drift apart.
  const cookieNext = request.cookies.get(AUTH_NEXT_COOKIE)?.value;
  const next = safeNextPath(searchParams.get("next") ?? cookieNext);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      res.cookies.delete(AUTH_NEXT_COOKIE);
      return res;
    }
  }

  // Arriving without a code means the provider sent us back empty-handed.
  // Google does that with ?error=access_denied when someone backs out of the
  // consent screen - a change of mind, not a broken link, and saying otherwise
  // is how you lose someone who would have tried again.
  const providerError = searchParams.get("error");
  const reason =
    providerError === "access_denied"
      ? "cancelled"
      : providerError && /provider|disabled|unsupported/i.test(providerError)
        ? "config"
        : "auth";

  const res = NextResponse.redirect(`${origin}/sign-in?error=${reason}`);
  res.cookies.delete(AUTH_NEXT_COOKIE);
  return res;
}
