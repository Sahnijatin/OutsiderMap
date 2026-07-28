/**
 * India geography registry: state -> cities the engine can target. Each city
 * carries a bounding hint for API-based sources and the display name sources
 * expect. Extend freely - the CLI validates against this.
 */
export const STATES = {
  delhi: {
    name: "Delhi (NCR)",
    cities: {
      delhi: { name: "New Delhi", lat: 28.6139, lng: 77.209, radiusM: 22000 },
      gurgaon: { name: "Gurugram", lat: 28.4595, lng: 77.0266, radiusM: 12000 },
      noida: { name: "Noida", lat: 28.5355, lng: 77.391, radiusM: 12000 },
      ghaziabad: { name: "Ghaziabad", lat: 28.6692, lng: 77.4538, radiusM: 10000 },
      faridabad: { name: "Faridabad", lat: 28.4089, lng: 77.3178, radiusM: 10000 },
    },
  },
  maharashtra: {
    name: "Maharashtra",
    cities: {
      mumbai: { name: "Mumbai", lat: 19.076, lng: 72.8777, radiusM: 20000 },
      pune: { name: "Pune", lat: 18.5204, lng: 73.8567, radiusM: 15000 },
      nashik: { name: "Nashik", lat: 19.9975, lng: 73.7898, radiusM: 10000 },
    },
  },
  karnataka: {
    name: "Karnataka",
    cities: {
      bengaluru: { name: "Bengaluru", lat: 12.9716, lng: 77.5946, radiusM: 18000 },
      mysuru: { name: "Mysuru", lat: 12.2958, lng: 76.6394, radiusM: 10000 },
    },
  },
  rajasthan: {
    name: "Rajasthan",
    cities: {
      jaipur: { name: "Jaipur", lat: 26.9124, lng: 75.7873, radiusM: 12000 },
      udaipur: { name: "Udaipur", lat: 24.5854, lng: 73.7125, radiusM: 8000 },
      jodhpur: { name: "Jodhpur", lat: 26.2389, lng: 73.0243, radiusM: 8000 },
    },
  },
  "tamil-nadu": {
    name: "Tamil Nadu",
    cities: {
      chennai: { name: "Chennai", lat: 13.0827, lng: 80.2707, radiusM: 15000 },
      pondicherry: { name: "Puducherry", lat: 11.9416, lng: 79.8083, radiusM: 8000 },
    },
  },
  telangana: {
    name: "Telangana",
    cities: {
      hyderabad: { name: "Hyderabad", lat: 17.385, lng: 78.4867, radiusM: 16000 },
    },
  },
  "west-bengal": {
    name: "West Bengal",
    cities: {
      kolkata: { name: "Kolkata", lat: 22.5726, lng: 88.3639, radiusM: 15000 },
    },
  },
  goa: {
    name: "Goa",
    cities: {
      panaji: { name: "Panaji", lat: 15.4909, lng: 73.8278, radiusM: 10000 },
      anjuna: { name: "Anjuna", lat: 15.5736, lng: 73.7407, radiusM: 8000 },
    },
  },
  kerala: {
    name: "Kerala",
    cities: {
      kochi: { name: "Kochi", lat: 9.9312, lng: 76.2673, radiusM: 10000 },
    },
  },
  "uttar-pradesh": {
    name: "Uttar Pradesh",
    cities: {
      lucknow: { name: "Lucknow", lat: 26.8467, lng: 80.9462, radiusM: 12000 },
      varanasi: { name: "Varanasi", lat: 25.3176, lng: 82.9739, radiusM: 8000 },
    },
  },
};

/** Categories the engine hunts, mapped to source-specific query terms. */
export const CATEGORIES = {
  cafe: { google: "specialty cafe", osm: ["cafe"] },
  restaurant: { google: "restaurant", osm: ["restaurant"] },
  bar: { google: "bar", osm: ["bar", "pub"] },
  bakery: { google: "bakery dessert", osm: ["bakery"] },
  "street-food": { google: "street food", osm: ["fast_food"] },
  experience: { google: "unique things to do", osm: ["arts_centre", "gallery"] },
};

export function resolveTargets(stateSlug, citySlugs) {
  const state = STATES[stateSlug];
  if (!state) {
    const known = Object.keys(STATES).join(", ");
    throw new Error(`Unknown state "${stateSlug}". Known: ${known}`);
  }
  const slugs = citySlugs?.length ? citySlugs : Object.keys(state.cities);
  return slugs.map((slug) => {
    const city = state.cities[slug];
    if (!city) {
      const known = Object.keys(state.cities).join(", ");
      throw new Error(`Unknown city "${slug}" in ${state.name}. Known: ${known}`);
    }
    return { slug, state: state.name, ...city };
  });
}
