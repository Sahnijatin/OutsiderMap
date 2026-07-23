import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/next-path";

/** OAuth/magic-link landing: exchanges the code for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Prefer an explicit ?next; else the cookie the sign-in flow stashes before an
  // OAuth redirect (Google can't carry ?next). Sanitized to a relative path.
  const cookieNext = request.cookies.get("om_auth_next")?.value;
  const next = safeNextPath(searchParams.get("next") ?? cookieNext);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      res.cookies.delete("om_auth_next");
      return res;
    }
  }

  const res = NextResponse.redirect(`${origin}/sign-in?error=auth`);
  res.cookies.delete("om_auth_next");
  return res;
}
