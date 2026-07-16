import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_DELHI } from "@/lib/cities";
import { MapCanvas } from "./map-canvas";

export const metadata: Metadata = {
  title: "The map",
};

/**
 * The app's home: a full-bleed night map of the member's city showing only
 * curated places. City comes from the profile (default delhi); every live
 * city is offered in search.
 */
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; place?: string }>;
}) {
  const profile = await requireOnboarded();
  const supabase = await createClient();
  const { welcome, place } = await searchParams;

  const { data: cities } = await supabase
    .from("cities")
    .select("slug, name, lat, lng, zoom")
    .eq("is_live", true)
    .order("name");

  const live = cities ?? [];
  const city =
    live.find((c) => c.slug === profile.home_city) ?? live[0] ?? null;

  return (
    <main className="fixed left-[var(--rail-w)] right-0 top-0 bottom-[var(--tab-clearance)]">
      <MapCanvas
        city={city ?? FALLBACK_DELHI}
        cities={live}
        welcome={welcome === "1"}
        outsiderNumber={profile.outsider_number}
        username={profile.username}
        initialPlaceSlug={place ?? null}
      />
    </main>
  );
}
