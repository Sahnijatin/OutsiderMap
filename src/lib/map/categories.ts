/**
 * Map pin categories — the color language of the map.
 *
 * Every place carries a free-text `category` (and a coarser `kind` enum). We
 * fold those into a small set of colored groups so the map reads at a glance:
 * one color per kind of night out, a legend to decode them. Colors are chosen
 * to sit on the night basemap and stay distinct from each other; amber stays
 * the default voice (food), and the reserved neon violet does double duty for
 * shopping here at the member's request.
 *
 * This module is framework-agnostic (no React, no Leaflet) so it can be shared
 * by the map markers, the legend, the place sheet, and the detail page.
 */

export type CategoryGroupId =
  | "food"
  | "nightlife"
  | "shopping"
  | "culture"
  | "outdoors";

export type CategoryGroup = {
  id: CategoryGroupId;
  label: string;
  /** Base pin color. */
  color: string;
  /** Lighter top stop for the pin's 3D gradient / specular read. */
  light: string;
  /** Darker bottom stop for the pin's 3D gradient + its outline. */
  dark: string;
  /** Raw place `category`/`kind` values that resolve to this group. */
  members: string[];
};

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: "food",
    label: "Cafés & restaurants",
    color: "#f0a431",
    light: "#ffd27a",
    dark: "#b9731c",
    members: [
      "restaurant",
      "cafe",
      "street-food",
      "late-night-eats",
      "dessert",
      "chai",
      "bakery",
    ],
  },
  {
    id: "nightlife",
    label: "Bars & nightlife",
    color: "#f2749e",
    light: "#ffb0c8",
    dark: "#c14d76",
    members: ["bar", "club", "music-venue", "nightlife"],
  },
  {
    id: "shopping",
    label: "Shopping & markets",
    color: "#b48aed",
    light: "#d7bcff",
    dark: "#8a5fd0",
    members: ["market", "bookstore", "shop", "shopping"],
  },
  {
    id: "culture",
    label: "Culture & art",
    color: "#59c6d6",
    light: "#98e6f0",
    dark: "#348c9a",
    members: [
      "gallery",
      "experience",
      "cultural",
      "historical",
      "workshop",
      "event",
      "museum",
    ],
  },
  {
    id: "outdoors",
    label: "Parks & views",
    color: "#79c98b",
    light: "#a9e7b7",
    dark: "#4d9c61",
    members: ["park", "viewpoint", "garden", "outdoors"],
  },
];

const GROUP_BY_MEMBER = new Map<string, CategoryGroup>();
for (const group of CATEGORY_GROUPS) {
  for (const member of group.members) GROUP_BY_MEMBER.set(member, group);
}

/** Food/amber is the fallback — the brand's default voice. */
const DEFAULT_GROUP = CATEGORY_GROUPS[0];

/**
 * Resolve a place's `category` (falling back to its `kind`) to a color group.
 * Always returns a group, so callers never branch on null.
 */
export function categoryGroup(
  category: string | null | undefined,
  kind?: string | null,
): CategoryGroup {
  const c = category?.trim().toLowerCase();
  if (c && GROUP_BY_MEMBER.has(c)) return GROUP_BY_MEMBER.get(c)!;
  const k = kind?.trim().toLowerCase();
  if (k && GROUP_BY_MEMBER.has(k)) return GROUP_BY_MEMBER.get(k)!;
  return DEFAULT_GROUP;
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
