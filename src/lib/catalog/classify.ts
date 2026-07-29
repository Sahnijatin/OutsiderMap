import type { PlaceKind } from "@/types/database";

/**
 * Inbound classifier: external evidence (Google Places types, OSM tags) ->
 * the product's five category groups + a catalog kind. Deterministic data
 * tables, no LLM - the harvest queue classifies thousands of candidates and
 * the answer must be instant, explainable, and unit-testable.
 *
 * A place can genuinely belong to more than one group (a restaurant inside
 * a park is food AND outdoors), so classification returns every distinct
 * match; the first by resolution priority is the primary (pin color).
 */

export const PRODUCT_CATEGORY_SLUGS = [
  "food",
  "nightlife",
  "shopping",
  "culture",
  "outdoors",
] as const;

export type ProductCategorySlug = (typeof PRODUCT_CATEGORY_SLUGS)[number];

export type Classification = {
  /** Primary group - drives the pin color (places.category_id). */
  productCategory: ProductCategorySlug;
  /** Every distinct group the evidence supports, primary first. */
  categories: ProductCategorySlug[];
  kind: PlaceKind;
  /** What decided the primary, e.g. "google:primaryType=bar". Null = fallback. */
  matchedSignal: string | null;
};

export type InboundSignals = {
  googlePrimaryType?: string | null;
  googleTypes?: readonly string[] | null;
  osmTags?: Record<string, string> | null;
  /** The sweep/search category's own mapping - used when evidence is silent. */
  prior?: { productCategory: ProductCategorySlug; kind: PlaceKind } | null;
};

type Target = { productCategory: ProductCategorySlug; kind: PlaceKind };

/**
 * Google Places API (New) "Table A" types worth mapping. tourist_attraction
 * is deliberately absent - hotels and malls carry it too.
 */
export const GOOGLE_TYPE_MAP: Record<string, Target> = {
  cafe: { productCategory: "food", kind: "cafe" },
  coffee_shop: { productCategory: "food", kind: "cafe" },
  tea_house: { productCategory: "food", kind: "cafe" },
  bakery: { productCategory: "food", kind: "cafe" },
  dessert_shop: { productCategory: "food", kind: "cafe" },
  ice_cream_shop: { productCategory: "food", kind: "cafe" },
  restaurant: { productCategory: "food", kind: "spot" },
  food_court: { productCategory: "food", kind: "spot" },
  meal_takeaway: { productCategory: "food", kind: "spot" },
  sandwich_shop: { productCategory: "food", kind: "spot" },
  bar: { productCategory: "nightlife", kind: "nightlife" },
  pub: { productCategory: "nightlife", kind: "nightlife" },
  wine_bar: { productCategory: "nightlife", kind: "nightlife" },
  night_club: { productCategory: "nightlife", kind: "nightlife" },
  karaoke: { productCategory: "nightlife", kind: "nightlife" },
  market: { productCategory: "shopping", kind: "spot" },
  shopping_mall: { productCategory: "shopping", kind: "spot" },
  book_store: { productCategory: "shopping", kind: "spot" },
  gift_shop: { productCategory: "shopping", kind: "spot" },
  flea_market: { productCategory: "shopping", kind: "spot" },
  museum: { productCategory: "culture", kind: "cultural" },
  art_gallery: { productCategory: "culture", kind: "cultural" },
  art_studio: { productCategory: "culture", kind: "cultural" },
  cultural_center: { productCategory: "culture", kind: "cultural" },
  cultural_landmark: { productCategory: "culture", kind: "cultural" },
  performing_arts_theater: { productCategory: "culture", kind: "cultural" },
  auditorium: { productCategory: "culture", kind: "cultural" },
  historical_landmark: { productCategory: "culture", kind: "historical" },
  historical_place: { productCategory: "culture", kind: "historical" },
  monument: { productCategory: "culture", kind: "historical" },
  park: { productCategory: "outdoors", kind: "spot" },
  national_park: { productCategory: "outdoors", kind: "spot" },
  state_park: { productCategory: "outdoors", kind: "spot" },
  botanical_garden: { productCategory: "outdoors", kind: "spot" },
  garden: { productCategory: "outdoors", kind: "spot" },
  dog_park: { productCategory: "outdoors", kind: "spot" },
  hiking_area: { productCategory: "outdoors", kind: "spot" },
  beach: { productCategory: "outdoors", kind: "spot" },
  observation_deck: { productCategory: "outdoors", kind: "spot" },
  picnic_ground: { productCategory: "outdoors", kind: "spot" },
  plaza: { productCategory: "outdoors", kind: "spot" },
};

/** OSM tag values worth mapping - enumerated, never historic=* (too noisy). */
export const OSM_TAG_MAP: Record<string, Record<string, Target>> = {
  amenity: {
    cafe: { productCategory: "food", kind: "cafe" },
    ice_cream: { productCategory: "food", kind: "cafe" },
    restaurant: { productCategory: "food", kind: "spot" },
    fast_food: { productCategory: "food", kind: "spot" },
    food_court: { productCategory: "food", kind: "spot" },
    bar: { productCategory: "nightlife", kind: "nightlife" },
    pub: { productCategory: "nightlife", kind: "nightlife" },
    nightclub: { productCategory: "nightlife", kind: "nightlife" },
    biergarten: { productCategory: "nightlife", kind: "nightlife" },
    marketplace: { productCategory: "shopping", kind: "spot" },
    arts_centre: { productCategory: "culture", kind: "cultural" },
    theatre: { productCategory: "culture", kind: "cultural" },
  },
  shop: {
    bakery: { productCategory: "food", kind: "cafe" },
    pastry: { productCategory: "food", kind: "cafe" },
    confectionery: { productCategory: "food", kind: "cafe" },
    coffee: { productCategory: "food", kind: "cafe" },
    tea: { productCategory: "food", kind: "cafe" },
    books: { productCategory: "shopping", kind: "spot" },
    gift: { productCategory: "shopping", kind: "spot" },
    mall: { productCategory: "shopping", kind: "spot" },
    antiques: { productCategory: "shopping", kind: "spot" },
  },
  leisure: {
    park: { productCategory: "outdoors", kind: "spot" },
    garden: { productCategory: "outdoors", kind: "spot" },
    nature_reserve: { productCategory: "outdoors", kind: "spot" },
  },
  tourism: {
    museum: { productCategory: "culture", kind: "cultural" },
    gallery: { productCategory: "culture", kind: "cultural" },
    artwork: { productCategory: "culture", kind: "cultural" },
    viewpoint: { productCategory: "outdoors", kind: "spot" },
  },
  historic: {
    monument: { productCategory: "culture", kind: "historical" },
    fort: { productCategory: "culture", kind: "historical" },
    castle: { productCategory: "culture", kind: "historical" },
    memorial: { productCategory: "culture", kind: "historical" },
    ruins: { productCategory: "culture", kind: "historical" },
    archaeological_site: { productCategory: "culture", kind: "historical" },
    tomb: { productCategory: "culture", kind: "historical" },
    palace: { productCategory: "culture", kind: "historical" },
    city_gate: { productCategory: "culture", kind: "historical" },
    citywalls: { productCategory: "culture", kind: "historical" },
  },
};

/** Priority order for OSM keys when several are present on one element. */
const OSM_KEY_ORDER = ["amenity", "shop", "leisure", "tourism", "historic"] as const;

function googleTarget(type: string): Target | null {
  const hit = GOOGLE_TYPE_MAP[type];
  if (hit) return hit;
  // Cuisine-specific restaurant types (south_indian_restaurant, ...) all
  // funnel to plain food/spot.
  if (type.endsWith("_restaurant")) return { productCategory: "food", kind: "spot" };
  return null;
}

/**
 * Classify one inbound place. Evidence outranks the sweep prior: a place
 * found by a "restaurant" sweep whose primaryType is "bar" is nightlife.
 */
export function classifyInbound(signals: InboundSignals): Classification {
  const matches: Array<{ target: Target; signal: string }> = [];

  if (signals.googlePrimaryType) {
    const t = googleTarget(signals.googlePrimaryType);
    if (t) {
      matches.push({ target: t, signal: `google:primaryType=${signals.googlePrimaryType}` });
    }
  }
  for (const type of signals.googleTypes ?? []) {
    const t = googleTarget(type);
    if (t) matches.push({ target: t, signal: `google:type=${type}` });
  }
  for (const key of OSM_KEY_ORDER) {
    const value = signals.osmTags?.[key];
    if (!value) continue;
    const t = OSM_TAG_MAP[key]?.[value];
    if (t) matches.push({ target: t, signal: `osm:${key}=${value}` });
  }

  if (matches.length === 0 && signals.prior) {
    return {
      productCategory: signals.prior.productCategory,
      categories: [signals.prior.productCategory],
      kind: signals.prior.kind,
      matchedSignal: null,
    };
  }
  if (matches.length === 0) {
    return {
      productCategory: "food",
      categories: ["food"],
      kind: "spot",
      matchedSignal: null,
    };
  }

  const primary = matches[0];
  const categories: ProductCategorySlug[] = [];
  for (const m of matches) {
    if (!categories.includes(m.target.productCategory)) {
      categories.push(m.target.productCategory);
    }
  }
  return {
    productCategory: primary.target.productCategory,
    categories,
    kind: primary.target.kind,
    matchedSignal: primary.signal,
  };
}

/** Kind -> group, for paths that only know a kind (ingest prior). */
export function productCategoryForKind(kind: string): ProductCategorySlug | null {
  switch (kind) {
    case "cafe":
      return "food";
    case "nightlife":
      return "nightlife";
    case "historical":
    case "cultural":
    case "workshop":
    case "event":
      return "culture";
    default:
      return null;
  }
}
