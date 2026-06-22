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
