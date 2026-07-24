import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";

export type City = Tables<"cities">;

export const FALLBACK_DELHI: City = {
  slug: "delhi",
  name: "Delhi NCR",
  lat: 28.6139,
  lng: 77.209,
  zoom: 11.2,
  is_live: true,
  areas: [],
  created_at: "",
};

/**
 * Resolve the city a request should operate in: the user's chosen home city
 * when it's live, otherwise the first live city. Falls back to a static
 * Delhi record so recommendation flows never hard-fail on a missing row.
 */
export async function resolveCity(
  supabase: SupabaseClient<Database>,
  preferredSlug?: string | null,
): Promise<City> {
  if (preferredSlug) {
    const { data } = await supabase
      .from("cities")
      .select("*")
      .eq("slug", preferredSlug)
      .eq("is_live", true)
      .maybeSingle();
    if (data) return data;
  }
  const { data: first } = await supabase
    .from("cities")
    .select("*")
    .eq("is_live", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return first ?? FALLBACK_DELHI;
}
