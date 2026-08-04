import "server-only";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { isCrossOriginWrite } from "@/lib/security/origin";
import type { Database } from "@/types/database";

/**
 * Dual-mode request auth for /api/* route handlers.
 *
 * The web app authenticates with Supabase session cookies; the mobile
 * (Expo/React Native) app cannot send those, so it passes the user's access
 * token as `Authorization: Bearer <token>`. Either way we return a Supabase
 * client scoped to that user, so RLS still applies exactly as it does on the
 * web - the bearer token rides along on every PostgREST/RPC call.
 *
 * Returns null when there is no valid session (caller responds 401).
 */
export type ApiContext = {
  user: User;
  supabase: SupabaseClient<Database>;
};

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

export async function getApiContext(
  request: Request,
): Promise<ApiContext | null> {
  const token = bearerToken(request);

  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;
    const supabase = createSupabaseClient<Database>(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Validates the JWT against Supabase Auth (not just decodes it).
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { user: data.user, supabase };
  }

  // Web fallback: session cookies.
  //
  // Cookies are attached by the browser to cross-site requests too, so this is
  // the one path that can be driven by another origin. Reject a cross-origin
  // write before the session is resolved (#148) - the caller's own 401 is the
  // response, which is the same answer the request would get with no session
  // at all, and tells a probing page nothing about whether one exists.
  if (isCrossOriginWrite(request)) return null;

  const supabase = await createCookieClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { user, supabase };
}

/**
 * Anon-tolerant request context (#116). Never 401s: returns the signed-in
 * user's client, or - when there's no session (or an invalid bearer token) -
 * an anon-role Supabase client. RLS still applies, so an anon client only ever
 * sees what the `using (true)` / published policies allow. Callers must treat
 * `user` as possibly null and key rate limits by IP in that case.
 */
export type OptionalApiContext = {
  user: User | null;
  supabase: SupabaseClient<Database>;
};

export async function getOptionalApiContext(
  request: Request,
): Promise<OptionalApiContext> {
  const ctx = await getApiContext(request);
  if (ctx) return ctx;

  // A rejected cross-origin write must not fall through to the cookie client.
  // That client is built from the request's cookies, so it still carries the
  // victim's session and PostgREST would run as them - the route would believe
  // it was serving an anonymous caller while RLS granted the signed-in user's
  // rights. Every anon-tolerant route is GET-only today, so this cannot fire
  // yet; it exists so that adding the first POST to one is not a silent hole.
  if (isCrossOriginWrite(request)) {
    return { user: null, supabase: anonClient() };
  }

  const supabase = await createCookieClient();
  return { user: null, supabase };
}

/** Cookie-free anon-role client: no session to borrow, RLS at its strictest. */
function anonClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
