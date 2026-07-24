import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  listMapCategories,
  buildCategoryIndex,
  resolveCategory,
} from "@/lib/map/categories";

/**
 * The map's catalog, as the slim GeoJSON the canvas draws.
 *
 * Shared by `/api/map/places` and the `/map` server page so the front door can
 * render its pins in the *first* paint. It used to be API-only, which meant a
 * cold open did two sequential round-trips before showing anything - HTML, then
 * hydrate, then fetch the places - and the map sat empty in between. Rendering
 * the first city's places server-side removes that second trip entirely.
 *
 * RLS scopes this to published rows; chains are excluded by product law.
 */

export type MapPlaceProperties = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  kind: string;
  category: string | null;
  /** Category color + label, resolved server-side so the client just draws. */
  categoryColor: string;
  categoryLabel: string;
  price_level: number | null;
  image_path: string | null;
  /** Exact Google navigation destination. Null until the pin is resolved. */
  googlePlaceId: string | null;
};

export type MapPlaceCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  MapPlaceProperties
>;

export const EMPTY_PLACES: MapPlaceCollection = {
  type: "FeatureCollection",
  features: [],
};

export async function listMapPlaces(
  supabase: SupabaseClient<Database>,
  citySlug: string,
): Promise<MapPlaceCollection> {
  const [{ data: places, error }, categories] = await Promise.all([
    supabase
      .from("places")
      .select(
        "id, slug, name, area, kind, category, category_id, price_level, lat, lng, image_path, google_place_id",
      )
      .eq("city", citySlug)
      .eq("is_published", true)
      .eq("is_chain", false)
      .not("lat", "is", null)
      .not("lng", "is", null),
    listMapCategories(supabase),
  ]);
  if (error) throw new Error(error.message);

  const index = buildCategoryIndex(categories);

  return {
    type: "FeatureCollection",
    features: (places ?? []).map((p) => {
      const { color, label } = resolveCategory(index, {
        categoryId: p.category_id,
        category: p.category,
        kind: p.kind,
      });
      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [p.lng as number, p.lat as number],
        },
        properties: {
          id: p.id,
          slug: p.slug,
          name: p.name,
          area: p.area,
          kind: p.kind,
          category: p.category,
          categoryColor: color,
          categoryLabel: label,
          price_level: p.price_level,
          image_path: p.image_path,
          googlePlaceId: p.google_place_id,
        },
      };
    }),
  };
}
