import "server-only";
import { serverEnv } from "@/lib/env";
import { HARVEST_CATEGORIES, type HarvestCity } from "@/lib/harvest/registry";
import type { Passage } from "@/lib/harvest/story";

/**
 * Discovery sources for one task (city x category x source), sized to fit a
 * single serverless invocation. Google via the OFFICIAL Places API; OSM via
 * Overpass with a modest radius-capped query. Never scraping.
 */

export type Sighting = {
  source: "google" | "osm";
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  website: string | null;
  mapsUrl: string | null;
  googlePlaceId: string | null;
  passages: Passage[];
  /** Classification evidence - fed to classifyInbound at approve time. */
  googlePrimaryType: string | null;
  googleTypes: string[];
  osmTags: Record<string, string> | null;
};

/** OSM tag keys worth keeping as classification evidence. */
const OSM_EVIDENCE_KEYS = ["amenity", "shop", "leisure", "tourism", "historic", "cuisine"];

const PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export async function googleDiscover(
  city: HarvestCity,
  category: string,
  maxResults: number,
): Promise<Sighting[]> {
  const apiKey = serverEnv().GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not set in the server environment");
  }
  const def = HARVEST_CATEGORIES[category];
  const sightings: Sighting[] = [];
  let pageToken: string | undefined;
  while (sightings.length < maxResults) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.rating",
          "places.userRatingCount",
          "places.priceLevel",
          "places.websiteUri",
          "places.googleMapsUri",
          "places.editorialSummary",
          "places.reviews",
          "places.types",
          "places.primaryType",
          "nextPageToken",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: `${def.google} in ${city.name}`,
        locationBias: {
          circle: {
            center: { latitude: city.lat, longitude: city.lng },
            radius: Math.min(city.radiusM, 50000),
          },
        },
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      places?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    };
    for (const raw of data.places ?? []) {
      const p = raw as {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        rating?: number;
        userRatingCount?: number;
        priceLevel?: string;
        websiteUri?: string;
        googleMapsUri?: string;
        editorialSummary?: { text?: string };
        reviews?: Array<{ text?: { text?: string } }>;
        types?: string[];
        primaryType?: string;
      };
      const passages: Passage[] = [];
      if (p.editorialSummary?.text) {
        passages.push({ text: p.editorialSummary.text, source: "google:editorial" });
      }
      for (const r of p.reviews ?? []) {
        if (r.text?.text) passages.push({ text: r.text.text, source: "google:review" });
      }
      sightings.push({
        source: "google",
        name: p.displayName?.text ?? "",
        address: p.formattedAddress ?? null,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        rating: p.rating ?? null,
        reviewCount: p.userRatingCount ?? null,
        priceLevel: p.priceLevel ? (PRICE_MAP[p.priceLevel] ?? null) : null,
        website: p.websiteUri ?? null,
        mapsUrl: p.googleMapsUri ?? null,
        googlePlaceId: p.id ?? null,
        passages,
        googlePrimaryType: p.primaryType ?? null,
        googleTypes: p.types ?? [],
        osmTags: null,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return sightings.filter((s) => s.name).slice(0, maxResults);
}

export async function osmDiscover(
  city: HarvestCity,
  category: string,
): Promise<Sighting[]> {
  const def = HARVEST_CATEGORIES[category];
  const around = `(around:${city.radiusM},${city.lat},${city.lng})`;
  const selectors: string[] = [];
  for (const [key, values] of Object.entries(def.osm)) {
    if (!values?.length) continue;
    const v = values.join("|");
    selectors.push(
      `node["${key}"~"^(${v})$"]["name"]${around};`,
      `way["${key}"~"^(${v})$"]["name"]${around};`,
    );
  }
  if (selectors.length === 0) return [];
  const query = `[out:json][timeout:40];(${selectors.join("")});out center 400;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    signal: AbortSignal.timeout(50_000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "OutsiderMap-harvest/1.0 (admin batch, low volume)",
    },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) {
    throw new Error(`Overpass ${res.status}`);
  }
  const data = (await res.json()) as {
    elements?: Array<{
      lat?: number;
      lon?: number;
      center?: { lat?: number; lon?: number };
      tags?: Record<string, string>;
    }>;
  };
  return (data.elements ?? [])
    .map((el): Sighting => {
      const tags = el.tags ?? {};
      const passages: Passage[] = [];
      if (tags.description) passages.push({ text: tags.description, source: "osm:description" });
      if (tags.cuisine) {
        passages.push({
          text: `Cuisine tags: ${tags.cuisine.replaceAll(";", ", ")}`,
          source: "osm:tags",
        });
      }
      return {
        source: "osm",
        name: tags.name ?? "",
        address:
          [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"]]
            .filter(Boolean)
            .join(", ") || null,
        lat: el.lat ?? el.center?.lat ?? null,
        lng: el.lon ?? el.center?.lon ?? null,
        rating: null,
        reviewCount: null,
        priceLevel: null,
        website: tags.website ?? null,
        mapsUrl: null,
        googlePlaceId: null,
        passages,
        googlePrimaryType: null,
        googleTypes: [],
        osmTags: Object.fromEntries(
          OSM_EVIDENCE_KEYS.filter((k) => tags[k]).map((k) => [k, tags[k]]),
        ),
      };
    })
    .filter((s) => s.name);
}
