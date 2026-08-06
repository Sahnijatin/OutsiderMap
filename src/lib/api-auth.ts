import "server-only";
import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
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
  const supabase = await createCookieClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { user, supabase };
}

/**
 * getApiContext plus the DPDP §9 age gate.
 *
 * Migration 58 enforces the gate in the database, as RESTRICTIVE policies
 * calling is_active_member(). That covers every route writing through the
 * member's own RLS-scoped client - but roughly a third of the member-facing
 * API writes with createAdminClient(), and the service role has BYPASSRLS, so
 * those policies are invisible to it. Without this helper a caller holding a
 * valid bearer token who never finished the setup flow could still create
 * posts, upload photos and submit places.
 *
 * Use this on any route that writes member content with the service role.
 * Routes that write through ctx.supabase are already covered by RLS and do not
 * need it (though it does no harm, and gives a clean error instead of an
 * opaque policy violation).
 *
 * Deliberately NOT applied to /api/grievances: a member who has been blocked
 * must still be able to complain about being blocked.
 */
export type AdultApiContext =
  | { ok: true; ctx: ApiContext }
  | { ok: false; error: "unauthorized" | "blocked" | "age_unverified" };

export async function requireAdultApiContext(
  request: Request,
): Promise<AdultApiContext> {
  const ctx = await getApiContext(request);
  if (!ctx) return { ok: false, error: "unauthorized" };

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("blocked_at, age_verified_at")
    .eq("id", ctx.user.id)
    .maybeSingle();

  // Fails closed: an unreadable profile row is not permission to write.
  if (!profile) return { ok: false, error: "age_unverified" };
  if (profile.blocked_at) return { ok: false, error: "blocked" };
  if (!profile.age_verified_at) return { ok: false, error: "age_unverified" };

  return { ok: true, ctx };
}

/** The HTTP status each refusal deserves, so routes stay one-liners. */
export function adultGateStatus(
  error: "unauthorized" | "blocked" | "age_unverified",
): number {
  return error === "unauthorized" ? 401 : 403;
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
  const supabase = await createCookieClient();
  return { user: null, supabase };
}
