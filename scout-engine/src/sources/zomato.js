/**
 * Zomato / District adapter - INTENTIONALLY A STUB.
 *
 * The reality: Zomato retired its public API years ago, and its site (like
 * District) sits behind aggressive anti-bot protection. Automated scraping of
 * it violates their Terms of Service, and doing it from a shared pipeline
 * gets IPs banned fast. If you accept that risk, the honest way is:
 *
 *   1. Run it YOURSELF, locally, with a real logged-in browser session
 *      (Playwright with a persistent profile), low volume, human-paced.
 *   2. Keep the output as an evidence stream feeding this same pipeline -
 *      implement `discover()` below to read from your locally-captured JSON
 *      dumps rather than hitting the network from here.
 *
 * The adapter interface is ready: return objects in the same RawPlace shape
 * as google.js/osm.js (source: "zomato", rating, reviewCount, passages from
 * review text) and the merge/gate/story pipeline treats it as one more
 * corroborating source. Until then, it contributes nothing and the run says
 * so honestly.
 */

import { readFile } from "node:fs/promises";

/**
 * Reads a local dump you produced yourself (array of RawPlace-shaped
 * objects) instead of scraping live. Pass --zomato-dump path/to/city.json.
 */
export function createZomatoSource({ dumpPath } = {}) {
  if (!dumpPath) return null;
  return {
    name: "zomato",
    async discover(city, categoryKey) {
      const raw = JSON.parse(await readFile(dumpPath, "utf8"));
      return raw
        .filter((p) => !p.category || p.category === categoryKey)
        .filter((p) => !p.city || p.city === city.slug)
        .map((p) => ({
          source: "zomato",
          sourceId: p.sourceId ?? p.url ?? p.name,
          name: p.name,
          address: p.address ?? null,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          category: categoryKey,
          rating: p.rating ?? null,
          reviewCount: p.reviewCount ?? null,
          priceLevel: p.priceLevel ?? null,
          website: p.url ?? null,
          mapsUrl: null,
          passages: (p.reviews ?? []).map((text) => ({ text, source: "zomato:review" })),
        }));
    },
  };
}
