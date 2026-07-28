import { CATEGORIES } from "./registry.js";
import { extractStorySignals } from "./story.js";
import { passesGate, qualityScore } from "./quality.js";

/**
 * The engine core: for each city x category, ask every source, merge the
 * duplicate sightings of the same physical place into one evidence-rich
 * record, extract story signals, then run the quality gate. Rejects aren't
 * discarded - they land on a separate sheet with the reason, so "why isn't X
 * in the list" is always answerable.
 */

/** ~meters between two coordinates (equirectangular, fine at city scale). */
function distanceM(a, b) {
  if (a.lat == null || b.lat == null) return Infinity;
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function normName(name) {
  return name
    .toLowerCase()
    .replace(/\b(the|cafe|café|restaurant|bar|kitchen|house)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Same physical place? Same-ish name within 250m (or exact name, no geo). */
function samePlace(a, b) {
  const an = normName(a.name);
  const bn = normName(b.name);
  if (!an || !bn) return false;
  const nameMatch = an === bn || an.includes(bn) || bn.includes(an);
  if (!nameMatch) return false;
  const d = distanceM(a, b);
  return d < 250 || d === Infinity;
}

function mergeSightings(sightings) {
  // Rated sources are more canonical; google first among equals.
  const ordered = [...sightings].sort((a, b) => {
    const rank = (s) => (s.source === "google" ? 0 : s.rating != null ? 1 : 2);
    return rank(a) - rank(b);
  });
  const primary = ordered[0];
  const merged = {
    name: primary.name,
    address: ordered.find((s) => s.address)?.address ?? null,
    lat: primary.lat,
    lng: primary.lng,
    category: primary.category,
    rating: ordered.find((s) => s.rating != null)?.rating ?? null,
    reviewCount: ordered.find((s) => s.reviewCount != null)?.reviewCount ?? null,
    priceLevel: ordered.find((s) => s.priceLevel != null)?.priceLevel ?? null,
    website: ordered.find((s) => s.website)?.website ?? null,
    mapsUrl: ordered.find((s) => s.mapsUrl)?.mapsUrl ?? null,
    sources: [...new Set(ordered.map((s) => s.source))],
    sourceIds: Object.fromEntries(ordered.map((s) => [s.source, s.sourceId])),
    passages: ordered.flatMap((s) => s.passages),
  };
  merged.storySignals = extractStorySignals(merged.passages);
  return merged;
}

/**
 * @returns {{accepted: object[], rejected: object[], errors: object[]}}
 */
export async function runCity(city, { sources, categories, gate, log }) {
  const sightings = [];
  const errors = [];
  for (const categoryKey of categories) {
    const categoryDef = CATEGORIES[categoryKey];
    for (const source of sources) {
      try {
        const found = await source.discover(city, categoryKey, categoryDef);
        log(`  ${source.name}/${categoryKey}: ${found.length} sightings`);
        sightings.push(...found.filter((p) => p.name));
      } catch (err) {
        errors.push({ city: city.slug, source: source.name, category: categoryKey, error: String(err?.message ?? err) });
        log(`  ${source.name}/${categoryKey}: FAILED - ${err?.message ?? err}`);
      }
    }
  }

  // Cluster sightings into physical places.
  const clusters = [];
  for (const s of sightings) {
    const hit = clusters.find((c) => c.some((existing) => samePlace(existing, s)));
    if (hit) hit.push(s);
    else clusters.push([s]);
  }

  const accepted = [];
  const rejected = [];
  for (const cluster of clusters) {
    const merged = mergeSightings(cluster);
    merged.city = city.slug;
    merged.cityName = city.name;
    merged.state = city.state;
    const verdict = passesGate(merged, gate);
    merged.gateReason = verdict.reason;
    merged.score = qualityScore(merged);
    (verdict.pass ? accepted : rejected).push(merged);
  }
  accepted.sort((a, b) => b.score - a.score);
  rejected.sort((a, b) => b.score - a.score);
  log(
    `  => ${clusters.length} unique places, ${accepted.length} passed the gate, ${rejected.length} rejected`,
  );
  return { accepted, rejected, errors };
}
