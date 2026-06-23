import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Surfaced loudly at startup rather than failing mysteriously on first call.
  console.warn(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY - copy mobile/.env.example to mobile/.env",
  );
}

/**
 * The mobile Supabase client. The session is persisted to AsyncStorage and the
 * access token is refreshed automatically; every API call to the backend rides
 * on `session.access_token` as a bearer (see lib/api.ts).
 */
export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
