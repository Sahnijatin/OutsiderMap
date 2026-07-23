import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/auth/session";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Persist the session across visits (#116); the proxy re-sets it each hit.
      cookieOptions: { maxAge: SESSION_COOKIE_MAX_AGE_SECONDS },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from a Server Component, where cookies are
            // read-only. Session refresh is handled by the proxy.
          }
        },
      },
    },
  );
}
