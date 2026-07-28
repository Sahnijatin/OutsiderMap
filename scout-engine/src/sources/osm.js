/**
 * OpenStreetMap (Overpass) adapter - fully open, keyless discovery. Its job
 * is finding places the ranking-driven sources under-surface (the hole-in-
 * the-wall problem). It has no ratings, so its finds pass the quality gate
 * only when another source corroborates them (or --keep-unrated is set,
 * which routes them to manual triage instead of the bin).
 */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

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
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "scout-engine/0.1 (place discovery; batch, low volume)",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) {
        throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = await res.json();
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
