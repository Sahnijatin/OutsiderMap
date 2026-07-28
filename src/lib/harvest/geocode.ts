import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * One-shot geocode for a console-added harvest city. Google Places (official
 * API) when the key is set, otherwise Nominatim - a single polite lookup per
 * admin action, well within OSM's usage policy. Returns null rather than
 * throwing: the add-city form treats "couldn't find it" as a validation
 * message, not a crash.
 */
export async function geocodeCity(
  cityName: string,
  stateName: string,
): Promise<{ lat: number; lng: number } | null> {
  const query = `${cityName}, ${stateName}, India`;
  const apiKey = serverEnv().GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location",
      },
      body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        places?: Array<{ location?: { latitude?: number; longitude?: number } }>;
      };
      const loc = data.places?.[0]?.location;
      if (loc?.latitude != null && loc?.longitude != null) {
        return { lat: loc.latitude, lng: loc.longitude };
      }
    }
  }

  // Nominatim requires an identifying User-Agent (same politeness Overpass
  // taught us the hard way).
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "in");
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "OutsiderMap-harvest/1.0 (admin console geocode)" },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const hit = rows[0];
  if (!hit?.lat || !hit?.lon) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
