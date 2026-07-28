import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Harvest geography: which cities the in-console scout can sweep, and how a
 * harvest city maps onto a PRODUCT city (places.city references cities.slug,
 * and NCR is deliberately one product city). A null productCity means the
 * catalog city doesn't exist yet - candidates can be harvested and reviewed,
 * but approve is blocked with an honest message until the city goes live.
 *
 * The static registry below covers every Indian state and union territory
 * with its notable cities. Anything missing is added from the console into
 * harvest_cities (see loadHarvestGeography), so no harvest ever waits on a
 * code change.
 */

export type HarvestCity = {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** cities.slug this harvest city publishes into, or null if not live. */
  productCity: string | null;
  /** true when the city came from harvest_cities (console-added). */
  custom?: boolean;
};

export type HarvestGeography = Record<
  string,
  { name: string; cities: HarvestCity[] }
>;

const city = (
  slug: string,
  name: string,
  lat: number,
  lng: number,
  radiusM: number,
  productCity: string | null = null,
): HarvestCity => ({ slug, name, lat, lng, radiusM, productCity });

export const HARVEST_STATES: HarvestGeography = {
  delhi: {
    name: "Delhi (NCR)",
    cities: [
      city("delhi", "New Delhi", 28.6139, 77.209, 22000, "delhi"),
      city("gurgaon", "Gurugram", 28.4595, 77.0266, 12000, "delhi"),
      city("noida", "Noida", 28.5355, 77.391, 12000, "delhi"),
      city("ghaziabad", "Ghaziabad", 28.6692, 77.4538, 10000, "delhi"),
      city("faridabad", "Faridabad", 28.4089, 77.3178, 10000, "delhi"),
    ],
  },
  "andhra-pradesh": {
    name: "Andhra Pradesh",
    cities: [
      city("visakhapatnam", "Visakhapatnam", 17.6868, 83.2185, 10000),
      city("vijayawada", "Vijayawada", 16.5062, 80.648, 8000),
      city("tirupati", "Tirupati", 13.6288, 79.4192, 6000),
    ],
  },
  "arunachal-pradesh": {
    name: "Arunachal Pradesh",
    cities: [
      city("itanagar", "Itanagar", 27.0844, 93.6053, 4000),
      city("tawang", "Tawang", 27.5859, 91.8594, 3000),
    ],
  },
  assam: {
    name: "Assam",
    cities: [
      city("guwahati", "Guwahati", 26.1445, 91.7362, 9000),
      city("dibrugarh", "Dibrugarh", 27.4728, 94.912, 5000),
      city("jorhat", "Jorhat", 26.7509, 94.2037, 5000),
    ],
  },
  bihar: {
    name: "Bihar",
    cities: [
      city("patna", "Patna", 25.5941, 85.1376, 10000),
      city("gaya", "Gaya", 24.7914, 85.0002, 6000),
      city("muzaffarpur", "Muzaffarpur", 26.1225, 85.3906, 6000),
    ],
  },
  chhattisgarh: {
    name: "Chhattisgarh",
    cities: [
      city("raipur", "Raipur", 21.2514, 81.6296, 8000),
      city("bilaspur-cg", "Bilaspur", 22.0797, 82.1409, 6000),
    ],
  },
  goa: {
    name: "Goa",
    cities: [
      city("panaji", "Panaji", 15.4909, 73.8278, 8000),
      city("mapusa", "North Goa (Mapusa)", 15.5937, 73.8142, 9000),
      city("margao", "South Goa (Margao)", 15.2832, 73.9862, 9000),
    ],
  },
  gujarat: {
    name: "Gujarat",
    cities: [
      city("ahmedabad", "Ahmedabad", 23.0225, 72.5714, 14000),
      city("surat", "Surat", 21.1702, 72.8311, 10000),
      city("vadodara", "Vadodara", 22.3072, 73.1812, 9000),
      city("rajkot", "Rajkot", 22.3039, 70.8022, 8000),
      city("bhuj", "Bhuj (Kutch)", 23.242, 69.6669, 6000),
    ],
  },
  haryana: {
    name: "Haryana",
    cities: [
      city("karnal", "Karnal", 29.6857, 76.9905, 6000),
      city("ambala", "Ambala", 30.3782, 76.7767, 6000),
      city("hisar", "Hisar", 29.1492, 75.7217, 6000),
    ],
  },
  "himachal-pradesh": {
    name: "Himachal Pradesh",
    cities: [
      city("shimla", "Shimla", 31.1048, 77.1734, 5000),
      city("manali", "Manali", 32.2396, 77.1887, 4000),
      city("dharamshala", "Dharamshala (McLeod Ganj)", 32.219, 76.3234, 5000),
      city("kasol", "Kasol", 32.01, 77.315, 3000),
      city("bir", "Bir", 32.0448, 76.7194, 3000),
    ],
  },
  jharkhand: {
    name: "Jharkhand",
    cities: [
      city("ranchi", "Ranchi", 23.3441, 85.3096, 8000),
      city("jamshedpur", "Jamshedpur", 22.8046, 86.2029, 8000),
      city("dhanbad", "Dhanbad", 23.7957, 86.4304, 7000),
    ],
  },
  karnataka: {
    name: "Karnataka",
    cities: [
      city("bengaluru", "Bengaluru", 12.9716, 77.5946, 18000),
      city("mysuru", "Mysuru", 12.2958, 76.6394, 8000),
      city("mangaluru", "Mangaluru", 12.9141, 74.856, 8000),
      city("hubballi", "Hubballi", 15.3647, 75.124, 8000),
      city("hampi", "Hampi", 15.335, 76.46, 4000),
    ],
  },
  kerala: {
    name: "Kerala",
    cities: [
      city("kochi", "Kochi", 9.9312, 76.2673, 10000),
      city("thiruvananthapuram", "Thiruvananthapuram", 8.5241, 76.9366, 9000),
      city("kozhikode", "Kozhikode", 11.2588, 75.7804, 8000),
      city("munnar", "Munnar", 10.0889, 77.0595, 4000),
      city("alappuzha", "Alappuzha (Alleppey)", 9.4981, 76.3388, 5000),
      city("wayanad", "Wayanad (Kalpetta)", 11.6087, 76.0834, 5000),
    ],
  },
  "madhya-pradesh": {
    name: "Madhya Pradesh",
    cities: [
      city("bhopal", "Bhopal", 23.2599, 77.4126, 10000),
      city("indore", "Indore", 22.7196, 75.8577, 10000),
      city("gwalior", "Gwalior", 26.2183, 78.1828, 8000),
      city("ujjain", "Ujjain", 23.1765, 75.7885, 6000),
      city("jabalpur", "Jabalpur", 23.1815, 79.9864, 8000),
    ],
  },
  maharashtra: {
    name: "Maharashtra",
    cities: [
      city("mumbai", "Mumbai", 19.076, 72.8777, 20000),
      city("pune", "Pune", 18.5204, 73.8567, 15000),
      city("nagpur", "Nagpur", 21.1458, 79.0882, 10000),
      city("nashik", "Nashik", 19.9975, 73.7898, 9000),
      city("aurangabad", "Chh. Sambhajinagar (Aurangabad)", 19.8762, 75.3433, 8000),
    ],
  },
  manipur: {
    name: "Manipur",
    cities: [city("imphal", "Imphal", 24.817, 93.9368, 5000)],
  },
  meghalaya: {
    name: "Meghalaya",
    cities: [
      city("shillong", "Shillong", 25.5788, 91.8933, 5000),
      city("cherrapunji", "Cherrapunji (Sohra)", 25.284, 91.7212, 3000),
    ],
  },
  mizoram: {
    name: "Mizoram",
    cities: [city("aizawl", "Aizawl", 23.7271, 92.7176, 5000)],
  },
  nagaland: {
    name: "Nagaland",
    cities: [
      city("kohima", "Kohima", 25.6751, 94.1086, 4000),
      city("dimapur", "Dimapur", 25.9091, 93.727, 5000),
    ],
  },
  odisha: {
    name: "Odisha",
    cities: [
      city("bhubaneswar", "Bhubaneswar", 20.2961, 85.8245, 9000),
      city("puri", "Puri", 19.8135, 85.8312, 5000),
      city("cuttack", "Cuttack", 20.4625, 85.8828, 7000),
    ],
  },
  punjab: {
    name: "Punjab",
    cities: [
      city("amritsar", "Amritsar", 31.634, 74.8723, 9000),
      city("ludhiana", "Ludhiana", 30.901, 75.8573, 9000),
      city("jalandhar", "Jalandhar", 31.326, 75.5762, 8000),
      city("patiala", "Patiala", 30.3398, 76.3869, 7000),
    ],
  },
  rajasthan: {
    name: "Rajasthan",
    cities: [
      city("jaipur", "Jaipur", 26.9124, 75.7873, 12000),
      city("udaipur", "Udaipur", 24.5854, 73.7125, 8000),
      city("jodhpur", "Jodhpur", 26.2389, 73.0243, 9000),
      city("jaisalmer", "Jaisalmer", 26.9157, 70.9083, 6000),
      city("pushkar", "Pushkar", 26.4897, 74.5511, 5000),
      city("kota", "Kota", 25.2138, 75.8648, 8000),
    ],
  },
  sikkim: {
    name: "Sikkim",
    cities: [city("gangtok", "Gangtok", 27.3389, 88.6065, 4000)],
  },
  "tamil-nadu": {
    name: "Tamil Nadu",
    cities: [
      city("chennai", "Chennai", 13.0827, 80.2707, 18000),
      city("coimbatore", "Coimbatore", 11.0168, 76.9558, 10000),
      city("madurai", "Madurai", 9.9252, 78.1198, 8000),
      city("tiruchirappalli", "Tiruchirappalli", 10.7905, 78.7047, 8000),
      city("ooty", "Ooty", 11.4102, 76.695, 5000),
    ],
  },
  telangana: {
    name: "Telangana",
    cities: [
      city("hyderabad", "Hyderabad", 17.385, 78.4867, 16000),
      city("warangal", "Warangal", 17.9689, 79.5941, 7000),
    ],
  },
  tripura: {
    name: "Tripura",
    cities: [city("agartala", "Agartala", 23.8315, 91.2868, 5000)],
  },
  "uttar-pradesh": {
    name: "Uttar Pradesh",
    cities: [
      city("lucknow", "Lucknow", 26.8467, 80.9462, 12000),
      city("varanasi", "Varanasi", 25.3176, 82.9739, 9000),
      city("agra", "Agra", 27.1767, 78.0081, 9000),
      city("kanpur", "Kanpur", 26.4499, 80.3319, 10000),
      city("prayagraj", "Prayagraj", 25.4358, 81.8463, 9000),
      city("mathura", "Mathura (Vrindavan)", 27.4924, 77.6737, 7000),
    ],
  },
  uttarakhand: {
    name: "Uttarakhand",
    cities: [
      city("dehradun", "Dehradun", 30.3165, 78.0322, 8000),
      city("rishikesh", "Rishikesh", 30.0869, 78.2676, 5000),
      city("haridwar", "Haridwar", 29.9457, 78.1642, 6000),
      city("nainital", "Nainital", 29.3919, 79.4542, 4000),
      city("mussoorie", "Mussoorie", 30.4598, 78.0644, 4000),
    ],
  },
  "west-bengal": {
    name: "West Bengal",
    cities: [
      city("kolkata", "Kolkata", 22.5726, 88.3639, 16000),
      city("darjeeling", "Darjeeling", 27.041, 88.2663, 5000),
      city("siliguri", "Siliguri", 26.7271, 88.3953, 7000),
    ],
  },
  "andaman-nicobar": {
    name: "Andaman & Nicobar",
    cities: [city("port-blair", "Port Blair", 11.6234, 92.7265, 5000)],
  },
  chandigarh: {
    name: "Chandigarh",
    cities: [city("chandigarh", "Chandigarh", 30.7333, 76.7794, 8000)],
  },
  "dadra-nagar-haveli-daman-diu": {
    name: "Dadra & Nagar Haveli and Daman & Diu",
    cities: [
      city("daman", "Daman", 20.3974, 72.8328, 4000),
      city("diu", "Diu", 20.7144, 70.9874, 3000),
    ],
  },
  "jammu-kashmir": {
    name: "Jammu & Kashmir",
    cities: [
      city("srinagar", "Srinagar", 34.0837, 74.7973, 7000),
      city("jammu", "Jammu", 32.7266, 74.857, 7000),
      city("gulmarg", "Gulmarg", 34.0484, 74.3805, 3000),
    ],
  },
  ladakh: {
    name: "Ladakh",
    cities: [city("leh", "Leh", 34.1526, 77.5771, 4000)],
  },
  lakshadweep: {
    name: "Lakshadweep",
    cities: [city("kavaratti", "Kavaratti", 10.5593, 72.6358, 3000)],
  },
  puducherry: {
    name: "Puducherry",
    cities: [city("puducherry", "Puducherry", 11.9416, 79.8083, 6000)],
  },
};

/** Static-registry lookup (console-added cities live in harvest_cities). */
export function harvestCityBySlug(slug: string): HarvestCity | null {
  for (const state of Object.values(HARVEST_STATES)) {
    const hit = state.cities.find((c) => c.slug === slug);
    if (hit) return hit;
  }
  return null;
}

/**
 * The full geography the console works with: the static registry merged
 * with console-added cities. A console city can extend an existing state
 * or introduce a brand-new one; a slug that collides with the static
 * registry is ignored (the registry wins).
 */
export async function loadHarvestGeography(
  admin: SupabaseClient<Database>,
): Promise<HarvestGeography> {
  const merged: HarvestGeography = {};
  for (const [slug, state] of Object.entries(HARVEST_STATES)) {
    merged[slug] = { name: state.name, cities: [...state.cities] };
  }
  const { data } = await admin
    .from("harvest_cities")
    .select("state_slug, state_name, slug, name, lat, lng, radius_m, product_city")
    .order("name");
  for (const row of data ?? []) {
    if (harvestCityBySlug(row.slug)) continue;
    const state = (merged[row.state_slug] ??= {
      name: row.state_name,
      cities: [],
    });
    if (state.cities.some((c) => c.slug === row.slug)) continue;
    state.cities.push({
      slug: row.slug,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      radiusM: row.radius_m,
      productCity: row.product_city,
      custom: true,
    });
  }
  return merged;
}

export function resolveHarvestCities(
  geography: HarvestGeography,
  stateSlug: string,
  citySlugs: string[],
): HarvestCity[] {
  const state = geography[stateSlug];
  if (!state) throw new Error(`Unknown state "${stateSlug}"`);
  const wanted = new Set(citySlugs);
  const cities = state.cities.filter((c) => wanted.has(c.slug));
  if (cities.length === 0) throw new Error("No valid cities selected.");
  return cities;
}

/**
 * Which product city a harvest city publishes into - static registry first,
 * then console-added cities. Null means publishing is blocked until the
 * city launches in the catalog.
 */
export async function harvestProductCity(
  admin: SupabaseClient<Database>,
  slug: string,
): Promise<string | null> {
  const staticHit = harvestCityBySlug(slug);
  if (staticHit) return staticHit.productCity;
  const { data } = await admin
    .from("harvest_cities")
    .select("product_city")
    .eq("slug", slug)
    .maybeSingle();
  return data?.product_city ?? null;
}

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
