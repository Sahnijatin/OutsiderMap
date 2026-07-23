import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Public taste card (#121). Reads the opt-in, public-safe subset of a member's
 * taste via the security-definer public_taste_card RPC — safe to call for an
 * anonymous viewer following a shared link.
 */

export type PublicTasteCard = {
  username: string;
  displayName: string | null;
  outsiderNumber: number | null;
  cityName: string | null;
  tasteSummary: string;
  vibeKeywords: string[];
};

export async function getPublicTasteCard(
  supabase: SupabaseClient<Database>,
  username: string,
): Promise<PublicTasteCard | null> {
  const { data, error } = await supabase.rpc("public_taste_card", {
    p_username: username,
  });
  if (error) throw new Error(error.message);

  const row = data?.[0];
  if (!row || !row.username || !row.taste_summary) return null;

  const vibes = Array.isArray(row.vibe_keywords)
    ? row.vibe_keywords.filter((v): v is string => typeof v === "string")
    : [];

  return {
    username: row.username,
    displayName: row.display_name,
    outsiderNumber: row.outsider_number,
    cityName: row.home_city
      ? row.home_city.charAt(0).toUpperCase() + row.home_city.slice(1)
      : null,
    tasteSummary: row.taste_summary,
    vibeKeywords: vibes.slice(0, 6),
  };
}
