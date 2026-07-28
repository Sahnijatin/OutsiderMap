/**
 * Google Places API (New) adapter - the primary structured source, used via
 * the OFFICIAL API (never page scraping: it violates ToS and breaks weekly).
 * Needs GOOGLE_MAPS_API_KEY with "Places API (New)" enabled. Costs money at
 * volume; the pipeline batches by city x category and stops at maxPerQuery.
 *
 * What it contributes: canonical name/geo, rating + review count (the quality
 * gate's fuel), price level, editorial summary, and up to 5 top reviews per
 * place - prime story-signal material.
 */

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const SEARCH_FIELDS = [
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
].join(",");

const PRICE_MAP = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function createGoogleSource({ apiKey, maxPerQuery = 40 }) {
  if (!apiKey) return null;

  async function search(body) {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": `${SEARCH_FIELDS},nextPageToken`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
  }

  return {
    name: "google",
    async discover(city, categoryKey, categoryDef) {
      const places = [];
      let pageToken;
      while (places.length < maxPerQuery) {
        const body = {
          textQuery: `${categoryDef.google} in ${city.name}`,
          locationBias: {
            circle: {
              center: { latitude: city.lat, longitude: city.lng },
              radius: Math.min(city.radiusM, 50000),
            },
          },
          pageSize: 20,
          ...(pageToken ? { pageToken } : {}),
        };
        const data = await search(body);
        for (const p of data.places ?? []) {
          const passages = [];
          if (p.editorialSummary?.text) {
            passages.push({ text: p.editorialSummary.text, source: "google:editorial" });
          }
          for (const r of p.reviews ?? []) {
            if (r.text?.text) passages.push({ text: r.text.text, source: "google:review" });
          }
          places.push({
            source: "google",
            sourceId: p.id,
            name: p.displayName?.text ?? "",
            address: p.formattedAddress ?? null,
            lat: p.location?.latitude ?? null,
            lng: p.location?.longitude ?? null,
            category: categoryKey,
            rating: p.rating ?? null,
            reviewCount: p.userRatingCount ?? null,
            priceLevel: PRICE_MAP[p.priceLevel] ?? null,
            website: p.websiteUri ?? null,
            mapsUrl: p.googleMapsUri ?? null,
            passages,
          });
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
      return places.slice(0, maxPerQuery);
    },
  };
}
