/**
 * Map categories - the color language of the map.
 *
 * Categories now live in the `map_categories` table (admin-managed: add a
 * category, change its color, reorder the legend). A place points at one via
 * `places.category_id`; this module is the framework-agnostic glue that resolves
 * a place to its color + label, shared by the map markers, the legend, the place
 * sheet, and the detail page. No React, no Leaflet, no server imports - the DB
 * read is done by the caller and the resolved list is passed in.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** One category = one legend row = one pin color. */
export type MapCategory = {
  id: string;
  slug: string;
  label: string;
  color: string;
  sortOrder: number;
};

/** Amber - the brand's default voice - for places without a resolvable category. */
export const FALLBACK_CATEGORY_COLOR = "#f0a431";
export const FALLBACK_CATEGORY_LABEL = "Other";

export type CategoryResolution = { color: string; label: string };

/** Load the active categories in legend order (caller supplies the client). */
export async function listMapCategories(
  supabase: SupabaseClient<Database>,
): Promise<MapCategory[]> {
  const { data, error } = await supabase
    .from("map_categories")
    .select("id, slug, label, color, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    label: c.label,
    color: c.color,
    sortOrder: c.sort_order,
  }));
}

export type CategoryIndex = {
  byId: Map<string, MapCategory>;
  bySlug: Map<string, MapCategory>;
};

/** Build id + slug lookups once, then resolve many places against them. */
export function buildCategoryIndex(
  categories: readonly MapCategory[],
): CategoryIndex {
  const byId = new Map<string, MapCategory>();
  const bySlug = new Map<string, MapCategory>();
  for (const c of categories) {
    byId.set(c.id, c);
    bySlug.set(c.slug.toLowerCase(), c);
  }
  return { byId, bySlug };
}

/**
 * Resolve a place's color + label. Prefers the FK (`categoryId`); falls back to
 * matching the legacy free-text `category`, then `kind`, against category slugs;
 * finally the amber default. Always returns a value so callers never branch.
 */
export function resolveCategory(
  index: CategoryIndex,
  opts: {
    categoryId?: string | null;
    category?: string | null;
    kind?: string | null;
  },
): CategoryResolution {
  if (opts.categoryId) {
    const c = index.byId.get(opts.categoryId);
    if (c) return { color: c.color, label: c.label };
  }
  const cat = opts.category?.trim().toLowerCase();
  if (cat) {
    const c = index.bySlug.get(cat);
    if (c) return { color: c.color, label: c.label };
  }
  const kind = opts.kind?.trim().toLowerCase();
  if (kind) {
    const c = index.bySlug.get(kind);
    if (c) return { color: c.color, label: c.label };
  }
  return {
    color: FALLBACK_CATEGORY_COLOR,
    label: categoryLabel(opts.category) ?? FALLBACK_CATEGORY_LABEL,
  };
}

/** Title-case a raw category token for display ("street-food" → "Street food"). */
export function categoryLabel(
  category: string | null | undefined,
): string | null {
  const c = category?.trim();
  if (!c) return null;
  const words = c.split(/[-_\s]+/);
  return words
    .map((w, i) =>
      i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase(),
    )
    .join(" ");
}
