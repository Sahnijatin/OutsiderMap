import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import {
  applySessionLifetime,
  readSessionPersistence,
  SESSION_PREF_COOKIE,
} from "@/lib/auth/session";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // No cookieOptions: @supabase/ssr ignores its maxAge (see
      // lib/auth/session.ts). The lifetime is applied in setAll below - which
      // matters most in Route Handlers like /auth/callback, where cookies are
      // writable and exchangeCodeForSession lands the first session cookie.
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          const persistence = readSessionPersistence(
            cookieStore.get(SESSION_PREF_COOKIE)?.value,
          );
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(
                name,
                value,
                applySessionLifetime(options, persistence, value),
              ),
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
