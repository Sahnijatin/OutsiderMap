import type { Metadata } from "next";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_DELHI } from "@/lib/cities";
import { listMapCategories } from "@/lib/map/categories";
import { EMPTY_PLACES, listMapPlaces } from "@/lib/map/places";
import { MapCanvas } from "./map-canvas";

export const metadata: Metadata = {
  title: "The map",
};

/**
 * The app's home, for everyone (#116): a full-bleed night map of curated
 * places. Anonymous visitors explore Delhi (or the first live city); a signed-in
 * member gets their home city. Walled actions and personalized results push to
 * sign-in - browsing the map is always open.
 */
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; place?: string }>;
}) {
  const profile = await getProfile(); // null when signed out
  const supabase = await createClient();
  const { welcome, place } = await searchParams;

  const [{ data: cities }, categories] = await Promise.all([
    supabase
      .from("cities")
      .select("slug, name, lat, lng, zoom")
      .eq("is_live", true)
      .order("name"),
    listMapCategories(supabase),
  ]);

  const live = cities ?? [];
  const city =
    live.find((c) => c.slug === profile?.home_city) ?? live[0] ?? null;

  // Render the first city's pins server-side so the map has something to draw
  // in the first paint. Without this the front door showed an empty map until a
  // post-hydration fetch came back - a second round-trip on every cold open.
  // A failure here is not fatal: the client re-fetches on mount as before.
  const initialPlaces = city
    ? await listMapPlaces(supabase, city.slug).catch(() => EMPTY_PLACES)
    : EMPTY_PLACES;

  return (
    <main className="fixed left-[var(--rail-w)] right-0 top-0 bottom-[var(--tab-clearance)]">
      <MapCanvas
        city={city ?? FALLBACK_DELHI}
        cities={live}
        categories={categories}
        initialPlaces={initialPlaces}
        welcome={welcome === "1"}
        outsiderNumber={profile?.outsider_number ?? null}
        username={profile?.username ?? null}
        initialPlaceSlug={place ?? null}
      />
    </main>
  );
}
