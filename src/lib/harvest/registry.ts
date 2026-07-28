import "server-only";

/**
 * Harvest geography: which cities the in-console scout can sweep, and how a
 * harvest city maps onto a PRODUCT city (places.city references cities.slug,
 * and NCR is deliberately one product city). A null productCity means the
 * catalog city doesn't exist yet - candidates can be harvested and reviewed,
 * but approve is blocked with an honest message until the city goes live.
 */

export type HarvestCity = {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** cities.slug this harvest city publishes into, or null if not live. */
  productCity: string | null;
};

export const HARVEST_STATES: Record<
  string,
  { name: string; cities: HarvestCity[] }
> = {
  delhi: {
    name: "Delhi (NCR)",
    cities: [
      { slug: "delhi", name: "New Delhi", lat: 28.6139, lng: 77.209, radiusM: 22000, productCity: "delhi" },
      { slug: "gurgaon", name: "Gurugram", lat: 28.4595, lng: 77.0266, radiusM: 12000, productCity: "delhi" },
      { slug: "noida", name: "Noida", lat: 28.5355, lng: 77.391, radiusM: 12000, productCity: "delhi" },
      { slug: "ghaziabad", name: "Ghaziabad", lat: 28.6692, lng: 77.4538, radiusM: 10000, productCity: "delhi" },
      { slug: "faridabad", name: "Faridabad", lat: 28.4089, lng: 77.3178, radiusM: 10000, productCity: "delhi" },
    ],
  },
  maharashtra: {
    name: "Maharashtra",
    cities: [
      { slug: "mumbai", name: "Mumbai", lat: 19.076, lng: 72.8777, radiusM: 20000, productCity: null },
      { slug: "pune", name: "Pune", lat: 18.5204, lng: 73.8567, radiusM: 15000, productCity: null },
    ],
  },
  karnataka: {
    name: "Karnataka",
    cities: [
      { slug: "bengaluru", name: "Bengaluru", lat: 12.9716, lng: 77.5946, radiusM: 18000, productCity: null },
    ],
  },
  rajasthan: {
    name: "Rajasthan",
    cities: [
      { slug: "jaipur", name: "Jaipur", lat: 26.9124, lng: 75.7873, radiusM: 12000, productCity: null },
      { slug: "udaipur", name: "Udaipur", lat: 24.5854, lng: 73.7125, radiusM: 8000, productCity: null },
    ],
  },
};

/** Harvest categories with per-source query terms and the catalog kind. */
export const HARVEST_CATEGORIES: Record<
  string,
  { google: string; osm: string[]; osmShop: string[]; kind: string }
> = {
  cafe: { google: "specialty cafe", osm: ["cafe"], osmShop: [], kind: "cafe" },
  restaurant: { google: "restaurant", osm: ["restaurant"], osmShop: [], kind: "spot" },
  bar: { google: "bar", osm: ["bar", "pub"], osmShop: [], kind: "nightlife" },
  bakery: {
    google: "bakery dessert",
    osm: ["ice_cream"],
    osmShop: ["bakery", "pastry", "confectionery"],
    kind: "cafe",
  },
  "street-food": { google: "street food", osm: ["fast_food"], osmShop: [], kind: "spot" },
};

export function resolveHarvestCities(
  stateSlug: string,
  citySlugs: string[],
): HarvestCity[] {
  const state = HARVEST_STATES[stateSlug];
  if (!state) throw new Error(`Unknown state "${stateSlug}"`);
  const wanted = new Set(citySlugs);
  const cities = state.cities.filter((c) => wanted.has(c.slug));
  if (cities.length === 0) throw new Error("No valid cities selected.");
  return cities;
}

export function harvestCityBySlug(slug: string): HarvestCity | null {
  for (const state of Object.values(HARVEST_STATES)) {
    const hit = state.cities.find((c) => c.slug === slug);
    if (hit) return hit;
  }
  return null;
}
