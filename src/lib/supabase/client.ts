import { createBrowserClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
import type { Database } from "@/types/database";
import {
  applySessionLifetime,
  readSessionPersistence,
  SESSION_PREF_COOKIE,
} from "@/lib/auth/session";

/**
 * The browser Supabase client.
 *
 * It supplies its own cookie adapter for one reason: this client writes the
 * FIRST session cookie, at verifyOtp / signInWithIdToken time. @supabase/ssr's
 * default writes it with a 400-day maxAge that our own options cannot override
 * (see lib/auth/session.ts), and the proxy only re-stamps cookies when auth
 * storage next changes - up to an hour later, at the next token refresh. So
 * deferring to the proxy would leave a persistent cookie on disk belonging to
 * someone who explicitly asked not to stay logged in, which is the whole
 * guarantee the checkbox sells.
 *
 * The adapter mirrors @supabase/ssr's own default (the same cookie
 * parse/serialize, so chunked and percent-encoded values round-trip
 * identically) and changes only the lifetime.
 */

function documentCookies() {
  const parsed = parse(document.cookie);
  return Object.keys(parsed).map((name) => ({
    name,
    value: parsed[name] ?? "",
  }));
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: documentCookies,
        setAll(cookiesToSet) {
          // Read the preference at WRITE time, never at construction:
          // createBrowserClient is a singleton, so a value captured once would
          // freeze whichever component happened to build the client first -
          // including before the member ticked the box.
          const persistence = readSessionPersistence(
            parse(document.cookie)[SESSION_PREF_COOKIE],
          );
          for (const { name, value, options } of cookiesToSet) {
            document.cookie = serialize(
              name,
              value,
              applySessionLifetime(options, persistence, value),
            );
          }
        },
      },
    },
  );
}
