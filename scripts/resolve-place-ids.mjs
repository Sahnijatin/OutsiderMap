/**
 * Resolves catalog places to Google `place_id`s so the Directions button lands
 * on the exact venue instead of text-searching for it.
 *
 * Why only place_id: under Google Maps Platform terms `place_id` is the field
 * that may be cached indefinitely. Other Place fields carry a short cache
 * limit and cannot be shown on a non-Google base map, and we render MapLibre.
 * So this script stores the id and nothing else. Google's coordinates are used
 * *in memory* to sanity-check the match and then discarded - the drift is
 * reported for a human to act on, never written.
 *
 * Matching is deliberately conservative. A wrong place_id sends people
 * confidently to the wrong restaurant, which is worse than the fuzzy search we
 * have today, so anything short of a high-confidence match is left unresolved
 * and printed for review.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   GOOGLE_MAPS_API_KEY=... node scripts/resolve-place-ids.mjs [options]
 *
 * Options:
 *   --dry-run          Resolve and report; write nothing.
 *   --city=delhi       Only this city slug (default: all).
 *   --limit=50         Stop after N places (default: all unresolved).
 *   --review           Also print the near-misses that were left unresolved.
 */

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DRY_RUN = flag("dry-run");
const SHOW_REVIEW = flag("review");
const CITY = value("city");
const LIMIT = Number(value("limit", "0")) || 0;

/** Auto-accept only inside this radius of our existing pin. */
const MAX_DRIFT_M = 400;
/** Beyond this, our own pin is probably the wrong one - flag, do not write. */
const SUSPECT_DRIFT_M = 150;
/** Minimum name similarity (0-1) to call it the same venue. */
const MIN_NAME_SIMILARITY = 0.6;
/** Google asks for courtesy on burst rate; this is well inside quota. */
const REQUEST_DELAY_MS = 120;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_KEY = requireEnv("GOOGLE_MAPS_API_KEY");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Metres between two lat/lng points. */
function haversineM(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const normalise = (s) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Token-overlap similarity. Robust to "Karim's" vs "Karim Hotel". */
function nameSimilarity(a, b) {
  const at = new Set(normalise(a).split(" ").filter(Boolean));
  const bt = new Set(normalise(b).split(" ").filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  return shared / Math.min(at.size, bt.size);
}

/**
 * Places API (New) text search, biased hard to our existing pin. The field
 * mask is the minimum that lets us verify the match: anything we request we
 * are responsible for not persisting.
 */
async function searchPlace(place) {
  const query = [place.name, place.area, place.city].filter(Boolean).join(", ");
  const body = {
    textQuery: query,
    maxResultCount: 5,
    languageCode: "en",
    regionCode: "IN",
  };
  if (place.lat != null && place.lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: place.lat, longitude: place.lng },
        radius: 2000,
      },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();
  return json.places ?? [];
}

/**
 * Pick the best candidate, or null. Returns the reason either way so the
 * review output explains itself.
 */
function chooseMatch(place, candidates) {
  if (candidates.length === 0) return { match: null, reason: "no results" };

  const scored = candidates.map((c) => {
    const name = c.displayName?.text ?? "";
    const similarity = nameSimilarity(place.name, name);
    const drift =
      place.lat != null && c.location
        ? haversineM(place.lat, place.lng, c.location.latitude, c.location.longitude)
        : null;
    return { id: c.id, name, similarity, drift };
  });

  scored.sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    return (a.drift ?? Infinity) - (b.drift ?? Infinity);
  });
  const best = scored[0];

  if (best.similarity < MIN_NAME_SIMILARITY) {
    return {
      match: null,
      reason: `best name "${best.name}" only ${best.similarity.toFixed(2)} similar`,
      best,
    };
  }
  if (best.drift != null && best.drift > MAX_DRIFT_M) {
    return {
      match: null,
      reason: `"${best.name}" is ${Math.round(best.drift)}m from our pin`,
      best,
    };
  }
  // A confident name match with a second, equally-named candidate nearby means
  // there really are two of them. Let a human choose.
  const rivals = scored.filter(
    (s) => s !== best && s.similarity >= MIN_NAME_SIMILARITY,
  );
  if (rivals.length > 0) {
    return {
      match: null,
      reason: `${rivals.length + 1} venues match "${place.name}" nearby`,
      best,
    };
  }
  return { match: best, reason: "ok" };
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  let query = supabase
    .from("places")
    .select("id, slug, name, city, area, lat, lng")
    .is("google_place_id", null)
    .order("created_at");
  if (CITY) query = query.eq("city", CITY);
  if (LIMIT) query = query.limit(LIMIT);

  const { data: places, error } = await query;
  if (error) throw new Error(error.message);

  console.log(
    `${places.length} place(s) to resolve${CITY ? ` in ${CITY}` : ""}${DRY_RUN ? " (dry run)" : ""}\n`,
  );

  const review = [];
  let resolved = 0;
  let drifted = 0;
  let failed = 0;

  for (const place of places) {
    try {
      const candidates = await searchPlace(place);
      const { match, reason, best } = chooseMatch(place, candidates);

      if (!match) {
        review.push({ place, reason, best });
        continue;
      }

      // Google's coordinate is only ever compared, never stored. A large gap
      // means OUR pin is wrong and a human should re-survey it.
      const suspect = match.drift != null && match.drift > SUSPECT_DRIFT_M;
      if (suspect) drifted += 1;

      if (!DRY_RUN) {
        const { error: writeErr } = await supabase
          .from("places")
          .update({
            google_place_id: match.id,
            geo_accuracy_m: match.drift != null ? Math.round(match.drift) : null,
            geo_updated_at: new Date().toISOString(),
          })
          .eq("id", place.id);
        if (writeErr) throw new Error(writeErr.message);
      }

      resolved += 1;
      const driftLabel =
        match.drift != null ? `${Math.round(match.drift)}m` : "unknown";
      console.log(
        `  ok  ${place.slug} -> ${match.id} (pin off by ${driftLabel})${suspect ? "  <- re-survey" : ""}`,
      );
    } catch (err) {
      failed += 1;
      console.error(`  err ${place.slug}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(
    `\nresolved ${resolved}, needs review ${review.length}, errors ${failed}`,
  );
  if (drifted > 0) {
    console.log(
      `${drifted} pin(s) are more than ${SUSPECT_DRIFT_M}m from the real venue - these are the ones users notice.`,
    );
  }

  if (review.length > 0 && SHOW_REVIEW) {
    console.log("\nLeft unresolved (a wrong id is worse than none):");
    for (const r of review) {
      console.log(`  ${r.place.slug} (${r.place.area ?? "?"}): ${r.reason}`);
    }
  } else if (review.length > 0) {
    console.log("Re-run with --review to see why they were skipped.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
