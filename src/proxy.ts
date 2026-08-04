import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  applySessionLifetime,
  readSessionPersistence,
  SESSION_PREF_COOKIE,
} from "@/lib/auth/session";

/**
 * Route prefixes that require a signed-in user. The map, place pages and /about
 * are deliberately absent: anyone can still explore them by link. Root is absent
 * too, but for a different reason - it now RENDERS the sign-in landing for
 * signed-out visitors rather than redirecting, so it must not be walled.
 * Personalized surfaces and every write stay walled here.
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
  "/submit",
  "/business",
  // Member blogs are members-only reading (can_view_post requires a session),
  // so the wall here matches what RLS already enforces.
  "/blog",
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

  // Read per request, not per client: the proxy re-stamps the auth cookies on
  // every refresh, so this is what makes a "session only" choice stick instead
  // of being quietly upgraded back to a rolling 60 days.
  const persistence = readSessionPersistence(
    request.cookies.get(SESSION_PREF_COOKIE)?.value,
  );

  const supabase = createServerClient(url, anonKey, {
    // No cookieOptions here on purpose - @supabase/ssr ignores its maxAge (see
    // lib/auth/session.ts). The lifetime is applied in setAll below.
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
          response.cookies.set(
            name,
            value,
            applySessionLifetime(options, persistence, value),
          ),
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
