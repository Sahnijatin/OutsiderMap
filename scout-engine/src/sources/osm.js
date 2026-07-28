/**
 * OpenStreetMap (Overpass) adapter - fully open, keyless discovery. Its job
 * is finding places the ranking-driven sources under-surface (the hole-in-
 * the-wall problem). It has no ratings, so its finds pass the quality gate
 * only when another source corroborates them (or --keep-unrated is set,
 * which routes them to manual triage instead of the bin).
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Overpass is a free, donated service that rate-limits rapid-fire clients
 * (429) and sheds load under pressure (504). Etiquette: space queries out
 * and back off patiently instead of hammering - a scouting run is a batch
 * job, it can afford to be slow.
 */
const MIN_GAP_MS = 8_000;
const RETRY_DELAYS_MS = [20_000, 45_000];
let lastCallAt = 0;

async function politePause() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createOsmSource({ timeoutS = 30 } = {}) {
  return {
    name: "osm",
    async discover(city, categoryKey, categoryDef) {
      const amenities = categoryDef.osm.join("|");
      const query = `
        [out:json][timeout:${timeoutS}];
        (
          node["amenity"~"^(${amenities})$"]["name"](around:${city.radiusM},${city.lat},${city.lng});
          way["amenity"~"^(${amenities})$"]["name"](around:${city.radiusM},${city.lat},${city.lng});
        );
        out center 500;
      `;
      // OSM etiquette (and overpass-api.de's mod_security) require an
      // identifying User-Agent; anonymous requests get an HTML error page.
      // 429/504 (rate limit / overload) get patient retries with backoff.
      let data;
      for (let attempt = 0; ; attempt++) {
        await politePause();
        let res;
        try {
          res = await fetch(OVERPASS_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": "scout-engine/0.1 (place discovery; batch, low volume)",
            },
            body: new URLSearchParams({ data: query }),
          });
        } catch (err) {
          // Network blip - treat like a transient server error.
          if (attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          throw err;
        }
        if (res.ok) {
          data = await res.json();
          break;
        }
        const transient = res.status === 429 || res.status === 502 || res.status === 504;
        if (transient && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      return (data.elements ?? []).map((el) => {
        const tags = el.tags ?? {};
        const passages = [];
        if (tags.description) passages.push({ text: tags.description, source: "osm:description" });
        if (tags.cuisine) {
          passages.push({ text: `Cuisine tags: ${tags.cuisine.replaceAll(";", ", ")}`, source: "osm:tags" });
        }
        return {
          source: "osm",
          sourceId: `${el.type}/${el.id}`,
          name: tags.name ?? "",
          address: [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"]]
            .filter(Boolean)
            .join(", ") || null,
          lat: el.lat ?? el.center?.lat ?? null,
          lng: el.lon ?? el.center?.lon ?? null,
          category: categoryKey,
          rating: null,
          reviewCount: null,
          priceLevel: null,
          website: tags.website ?? null,
          mapsUrl: null,
          passages,
        };
      });
    },
  };
}
