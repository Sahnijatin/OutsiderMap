import "server-only";
import { serverEnv } from "@/lib/env";
import type { Json } from "@/types/database";

/**
 * Google Maps link understanding for street submissions. Two rules keep this
 * clean: the URL itself is fair game (people share it with us on purpose),
 * and google.com HTML is never scraped - canonical data comes only from the
 * official Places API when GOOGLE_MAPS_API_KEY is configured.
 */

const MAPS_HOSTS = [
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
  "www.google.co.in",
  "google.co.in",
];

export function isMapsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "maps.app.goo.gl") return true;
    if (host === "goo.gl") return u.pathname.startsWith("/maps");
    if (host === "maps.google.com") return true;
    return MAPS_HOSTS.includes(host) && /^\/maps(\/|$)/.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Short links (maps.app.goo.gl/...) redirect to the full URL - follow the
 * redirect chain (headers only, no body parsing) to get the parseable form.
 */
export async function expandMapsUrl(url: string, maxHops = 4): Promise<string> {
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    let u;
    try {
      u = new URL(current);
    } catch {
      return current;
    }
    const isShort = u.hostname === "maps.app.goo.gl" || u.hostname === "goo.gl";
    if (!isShort) return current;
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; OutsiderMapBot/1.0)" },
      });
      const location = res.headers.get("location");
      if (!location) return current;
      current = new URL(location, current).toString();
    } catch {
      return current;
    }
  }
  return current;
}

export type ParsedMapsUrl = {
  /** Human place name from the URL path, when present. */
  name: string | null;
  lat: number | null;
  lng: number | null;
  /** Free-text query (?q= / /maps/search/) when no place path exists. */
  query: string | null;
};

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " ")).trim();
  } catch {
    return s.replace(/\+/g, " ").trim();
  }
};

/** Pull what the full (non-short) Maps URL itself says about the place. */
export function parseMapsUrl(url: string): ParsedMapsUrl {
  const out: ParsedMapsUrl = { name: null, lat: null, lng: null, query: null };
  let u;
  try {
    u = new URL(url);
  } catch {
    return out;
  }

  // /maps/place/<name>/@lat,lng,... - the richest common form.
  const placeMatch = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (placeMatch) out.name = decode(placeMatch[1]);

  // Pin coordinates: !3d<lat>!4d<lng> (exact pin) beats /@lat,lng (viewport).
  const pin = url.match(/!3d(-?\d+(?:\.\d+))!4d(-?\d+(?:\.\d+))/);
  const viewport = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const coords = pin ?? viewport;
  if (coords) {
    const lat = Number(coords[1]);
    const lng = Number(coords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      out.lat = lat;
      out.lng = lng;
    }
  }

  // ?q=... or /maps/search/<query> when there's no /place/ path.
  const q = u.searchParams.get("q");
  const searchMatch = u.pathname.match(/\/maps\/search\/([^/]+)/);
  if (!out.name) {
    const raw = q ?? (searchMatch ? searchMatch[1] : null);
    if (raw && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(raw)) out.query = decode(raw);
  }

  return out;
}

/**
 * Canonical lookup via the OFFICIAL Places API (never scraping). Returns a
 * compact block for raw_metadata, or null when no key is configured or
 * nothing matches - a thin submission is still reviewable.
 */
export async function lookupGooglePlace(opts: {
  text: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<Record<string, Json> | null> {
  const apiKey = serverEnv().GOOGLE_MAPS_API_KEY;
  if (!apiKey || !opts.text) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
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
        "places.editorialSummary",
        "places.googleMapsUri",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: opts.text,
      pageSize: 1,
      ...(opts.lat != null && opts.lng != null
        ? {
            locationBias: {
              circle: {
                center: { latitude: opts.lat, longitude: opts.lng },
                radius: 2000,
              },
            },
          }
        : {}),
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { places?: Array<Record<string, unknown>> };
  const p = data.places?.[0] as
    | {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        rating?: number;
        userRatingCount?: number;
        priceLevel?: string;
        editorialSummary?: { text?: string };
        googleMapsUri?: string;
      }
    | undefined;
  if (!p) return null;
  return {
    place_id: p.id ?? null,
    name: p.displayName?.text ?? null,
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    rating: p.rating ?? null,
    review_count: p.userRatingCount ?? null,
    price_level: p.priceLevel ?? null,
    editorial: p.editorialSummary?.text ?? null,
    maps_uri: p.googleMapsUri ?? null,
  };
}
