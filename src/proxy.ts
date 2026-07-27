import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/auth/session";

/**
 * Route prefixes that require a signed-in user. The map, place pages, /about and
 * root are deliberately absent (#116): anyone can explore. Personalized surfaces
 * and every write stay walled here.
 *
 * This list MUST track the actual route tree (src/app + src/app/(shell)):
 * a member surface missing here loses its `?next=` return path after sign-in,
 * and a retired route left here walls off a dead prefix. When adding or
 * removing an app route, update this list and the pinning test in
 * tests/auth/protected-prefixes.test.ts.
 */
export const PROTECTED_PREFIXES = [
  "/chat",
  "/quests",
  "/setup",
  "/now",
  "/profile",
  "/weekend",
  "/saved",
  "/events",
  "/account",
  "/admin",
  "/feed",
  "/activity",
  "/compose",
  "/market-run",
  "/welcome",
];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Skip session refresh entirely when Supabase isn't configured
  // (e.g. preview builds without env vars).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    // Rolling 60-day session: the refresh below re-sets the cookies each visit.
    cookieOptions: { maxAge: SESSION_COOKIE_MAX_AGE_SECONDS },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes the auth token if expired; required for Server Components
  // to see a valid session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtected(pathname)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  if (user && pathname === "/sign-in") {
    return NextResponse.redirect(new URL("/map", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
