import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { classifyPlace, countByName, normaliseName } from "@/lib/places/franchise";

/**
 * Operator jobs, runnable from /admin without a terminal.
 *
 * These used to be `node scripts/...` one-offs, which assumed whoever runs the
 * catalog has a checkout and a shell. That is a bad assumption for the person
 * who will actually be curating places.
 *
 * Everything here works in BATCHES and reports what is left. Vercel caps
 * request duration, so a 6,000-row import cannot finish in one call - and
 * batching turns out to be better to operate anyway, because you can watch it
 * and stop it.
 *
 * Each job is idempotent: running a batch twice does not double-import,
 * because progress is derived from the database rather than a cursor we have
 * to keep somewhere.
 */

export type BatchResult = {
  /** Rows this call actually acted on. */
  processed: number;
  /** Estimated rows still to go. Zero means done. */
  remaining: number;
  /** Human-readable lines for the admin UI. */
  notes: string[];
};

type Admin = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Import Overture candidates
// ---------------------------------------------------------------------------

const CANDIDATES_FILE = "data/overture.ncr.json";

export type OvertureCandidate = {
  name: string;
  category: string | null;
  confidence: number;
  lat: number;
  lng: number;
  /** Neighbourhood, from the venue's own address or nearest area centroid. */
  area?: string | null;
  address?: string | null;
  website?: string | null;
  instagram?: string | null;
  phone?: string | null;
};

let candidateCache: OvertureCandidate[] | null = null;

async function loadCandidates(): Promise<OvertureCandidate[]> {
  if (candidateCache) return candidateCache;
  const raw = await readFile(path.join(process.cwd(), CANDIDATES_FILE), "utf8");
  candidateCache = JSON.parse(raw) as OvertureCandidate[];
  return candidateCache;
}

/** Overture's taxonomy mapped onto ours. Anything unmapped becomes a spot. */
const KIND_BY_CATEGORY: Record<string, string> = {
  bakery: "cafe",
  dessert_shop: "cafe",
  ice_cream_shop: "cafe",
  juice_bar: "cafe",
  cafe: "cafe",
  coffee_shop: "cafe",
  tea_room: "cafe",
  bar: "nightlife",
  pub: "nightlife",
  brewery: "nightlife",
  wine_bar: "nightlife",
  cocktail_bar: "nightlife",
  night_club: "nightlife",
  music_venue: "nightlife",
  landmark_and_historical_building: "historical",
  monument: "historical",
  museum: "cultural",
  art_gallery: "cultural",
  performing_arts: "cultural",
  bookstore: "cultural",
  antique_store: "cultural",
};

/** Same name within this distance of an existing row is the same place. */
const DUPE_RADIUS_M = 120;

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function slugify(name: string, lat: number, lng: number) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);
  // Coordinate-derived suffix, so re-running produces the SAME slug for the
  // same venue and the unique index catches a repeat rather than duplicating.
  const seed = Math.abs(Math.round(lat * 1e4) * 31 + Math.round(lng * 1e4))
    .toString(36)
    .slice(-6);
  return `${base || "place"}-${seed}`;
}

/**
 * Every place in a city, read past PostgREST's 1000-row page cap.
 *
 * This cap is why the first version of the importer stalled at about 1,100
 * rows: it read "all" existing places, silently got only the first 1000, so
 * candidates it had already imported stopped looking like duplicates. They
 * were re-selected every batch, collided on their unique slug, inserted
 * nothing, and the runner read zero-inserted as "done".
 */
async function loadAllPlaces(admin: Admin, city: string) {
  const PAGE = 1000;
  const rows: {
    slug: string;
    name: string;
    area: string | null;
    lat: number | null;
    lng: number | null;
  }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("places")
      .select("slug, name, area, lat, lng")
      .eq("city", city)
      .order("slug")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * Import a batch of Overture candidates as unpublished drafts.
 *
 * Unpublished on purpose: Overture gives a name, a category and a point. It
 * does not give a reason to go, and a place with no reason to go is what makes
 * a discovery map feel like a phone book.
 */
export async function importOvertureBatch(
  admin: Admin,
  opts: { city?: string; batchSize?: number } = {},
): Promise<BatchResult> {
  const city = opts.city ?? "delhi";
  const batchSize = opts.batchSize ?? 250;

  const candidates = await loadCandidates();
  const counts = countByName(candidates);

  const existing = await loadAllPlaces(admin, city);

  // Two indexes, because they answer different questions.
  //
  // By slug: "did WE already import this exact candidate?" Slugs are derived
  // from name + coordinates, so they are stable across runs.
  //
  // By name + distance: "is this the same venue as something already in the
  // hand-curated catalog?", where the slug will not match because a human
  // wrote it.
  const existingSlugs = new Set(existing.map((p) => p.slug));
  // Rows imported before we knew each venue's neighbourhood. Cheap to fix
  // while we are here, and area is the single most visible empty field.
  const missingArea = new Map(
    existing.filter((p) => !p.area).map((p) => [p.slug, true] as const),
  );
  const byName = new Map<string, { lat: number | null; lng: number | null }[]>();
  for (const p of existing) {
    const key = normaliseName(p.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(p);
  }

  const alreadyHere = (c: OvertureCandidate) =>
    (byName.get(normaliseName(c.name)) ?? []).some(
      (p) => p.lat != null && haversineM(p.lat, p.lng!, c.lat, c.lng) <= DUPE_RADIUS_M,
    );

  const rows: Database["public"]["Tables"]["places"]["Insert"][] = [];
  let skippedChain = 0;
  let skippedReview = 0;
  let skippedDupe = 0;
  let remaining = 0;
  const areaFixes: { slug: string; area: string }[] = [];

  for (const c of candidates) {
    const verdict = classifyPlace({
      name: c.name,
      text: c.category,
      outletCount: counts.get(normaliseName(c.name)) ?? 1,
    });
    if (verdict.verdict === "chain") {
      skippedChain += 1;
      continue;
    }
    if (verdict.verdict === "review") {
      // Held back entirely rather than imported flagged - an unreviewed
      // franchise in the catalog is exactly what the product promises not
      // to have.
      skippedReview += 1;
      continue;
    }
    const slug = slugify(c.name, c.lat, c.lng);
    if (existingSlugs.has(slug) || alreadyHere(c)) {
      if (c.area && missingArea.has(slug)) areaFixes.push({ slug, area: c.area });
      skippedDupe += 1;
      continue;
    }
    if (rows.length >= batchSize) {
      remaining += 1;
      continue;
    }
    rows.push({
      slug,
      name: c.name,
      city,
      lat: c.lat,
      lng: c.lng,
      area: c.area ?? null,
      category: c.category,
      kind: (KIND_BY_CATEGORY[c.category ?? ""] ??
        "spot") as Database["public"]["Tables"]["places"]["Insert"]["kind"],
      is_chain: false,
      is_published: false,
      source: "ingested",
      geo_source: "overture",
      geo_updated_at: new Date().toISOString(),
    });
    // Count it locally so two candidates for the same venue in one batch
    // cannot both land.
    existingSlugs.add(slug);
    const key = normaliseName(c.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push({ lat: c.lat, lng: c.lng });
  }

  // Backfill areas before inserting, capped so one batch stays inside the
  // request budget.
  let areasFilled = 0;
  for (const fix of areaFixes.slice(0, 200)) {
    const { error } = await admin
      .from("places")
      .update({ area: fix.area })
      .eq("slug", fix.slug)
      .is("area", null);
    if (!error) areasFilled += 1;
  }

  let processed = 0;
  if (rows.length > 0) {
    // Ignore duplicates rather than failing the batch: a slug collision means
    // that venue is already in, which is a success not an error.
    const { data, error } = await admin
      .from("places")
      .upsert(rows, { onConflict: "slug", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    processed = data?.length ?? 0;
  }

  return {
    // Area backfills count as work done, so the runner keeps going while
    // there are still drafts to repair even when nothing new inserts.
    processed: processed + areasFilled,
    remaining: remaining + Math.max(0, areaFixes.length - 200),
    notes: [
      `${candidates.length} candidates in the file`,
      areasFilled > 0 ? `${areasFilled} existing drafts given their area` : "",
      `${skippedChain} excluded as chains`,
      `${skippedReview} held for human review`,
      `${skippedDupe} already in the catalog`,
      processed > 0
        ? `${processed} imported as unpublished drafts`
        : "nothing new to import",
    ].filter(Boolean),
  };
}

/**
 * Name -> a page we can actually read about that venue, for enrichment.
 * Its own website first, Instagram second. Venues with neither are absent,
 * which is the point: there is nothing to write from.
 */
export async function candidateSourceLinks(): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (const c of await loadCandidates()) {
    const url = c.website ?? c.instagram;
    if (!url) continue;
    // Keyed by the exact name we insert, so the enrichment query can filter
    // server-side with .in("name", ...) instead of pulling drafts blindly and
    // hoping they happen to have a source.
    if (!links.has(c.name)) links.set(c.name, url);
  }
  return links;
}

/** How much of the import is left, without importing anything. */
export async function overtureImportStatus(
  admin: Admin,
  city = "delhi",
): Promise<{ imported: number; total: number }> {
  const [{ count }, candidates] = await Promise.all([
    admin
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("city", city)
      .eq("geo_source", "overture"),
    loadCandidates(),
  ]);
  return { imported: count ?? 0, total: candidates.length };
}

// ---------------------------------------------------------------------------
// Resolve Google place_ids
// ---------------------------------------------------------------------------

const MAX_DRIFT_M = 400;
const MIN_NAME_SIMILARITY = 0.6;

function nameSimilarity(a: string, b: string): number {
  const at = new Set(normaliseName(a).split(" ").filter(Boolean));
  const bt = new Set(normaliseName(b).split(" ").filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  return shared / Math.min(at.size, bt.size);
}

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  location?: { latitude: number; longitude: number };
};

/**
 * Resolve a batch of places to their Google place_id, so the Directions button
 * lands on the exact venue instead of text-searching for it.
 *
 * Conservative by design: a wrong place_id navigates people confidently to the
 * wrong restaurant, which is worse than the fuzzy search we had. Only a strong
 * name match inside 400m with no same-named rival nearby is accepted.
 *
 * Only `place_id` is stored - it is the one Google Maps Platform field that may
 * be cached indefinitely. Google's coordinates are used in memory to measure
 * how far off our pin is, then discarded.
 */
export async function resolvePlaceIdsBatch(
  admin: Admin,
  opts: { apiKey: string; city?: string; batchSize?: number },
): Promise<BatchResult> {
  const batchSize = opts.batchSize ?? 40;

  let query = admin
    .from("places")
    .select("id, name, city, area, lat, lng")
    .is("google_place_id", null)
    .not("lat", "is", null)
    .eq("is_published", true)
    .order("created_at")
    .limit(batchSize);
  if (opts.city) query = query.eq("city", opts.city);

  const { data: places, error } = await query;
  if (error) throw new Error(error.message);

  let resolved = 0;
  let unresolved = 0;
  let drifted = 0;
  // A failed API call and a genuine no-match are completely different
  // problems, and reporting both as "left alone" hid a broken key behind a
  // sentence that read like careful behaviour.
  let apiErrors = 0;
  let firstError: string | null = null;

  for (const place of places ?? []) {
    const body = {
      textQuery: [place.name, place.area, place.city].filter(Boolean).join(", "),
      maxResultCount: 5,
      languageCode: "en",
      regionCode: "IN",
      locationBias: {
        circle: {
          center: { latitude: place.lat!, longitude: place.lng! },
          radius: 2000,
        },
      },
    };

    let candidates: GooglePlace[] = [];
    try {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": opts.apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.location",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Places API ${res.status}: ${body.slice(0, 200)}`);
      }
      candidates = ((await res.json()) as { places?: GooglePlace[] }).places ?? [];
    } catch (err) {
      apiErrors += 1;
      firstError ??= err instanceof Error ? err.message : String(err);
      continue;
    }

    const scored = candidates.map((c) => ({
      id: c.id,
      name: c.displayName?.text ?? "",
      similarity: nameSimilarity(place.name, c.displayName?.text ?? ""),
      drift: c.location
        ? haversineM(place.lat!, place.lng!, c.location.latitude, c.location.longitude)
        : null,
    }));
    scored.sort(
      (a, b) =>
        b.similarity - a.similarity || (a.drift ?? Infinity) - (b.drift ?? Infinity),
    );
    const best = scored[0];
    const rivals = scored.filter(
      (s) => s !== best && s.similarity >= MIN_NAME_SIMILARITY,
    );

    if (
      !best ||
      best.similarity < MIN_NAME_SIMILARITY ||
      (best.drift != null && best.drift > MAX_DRIFT_M) ||
      rivals.length > 0
    ) {
      unresolved += 1;
      continue;
    }

    await admin
      .from("places")
      .update({
        google_place_id: best.id,
        geo_accuracy_m: best.drift != null ? Math.round(best.drift) : null,
        geo_updated_at: new Date().toISOString(),
      })
      .eq("id", place.id);
    resolved += 1;
    if (best.drift != null && best.drift > 150) drifted += 1;
  }

  const { count } = await admin
    .from("places")
    .select("id", { count: "exact", head: true })
    .is("google_place_id", null)
    .not("lat", "is", null)
    .eq("is_published", true);

  if (apiErrors > 0 && resolved === 0) {
    // Every call failed. That is a broken key or a disabled API, not a
    // cautious matcher, and saying so is the whole point.
    throw new Error(
      `Google Places rejected all ${apiErrors} requests. ${firstError ?? ""}`.trim(),
    );
  }

  return {
    processed: resolved,
    remaining: Math.max(0, (count ?? 0) - unresolved),
    notes: [
      `${resolved} pinned exactly`,
      unresolved > 0
        ? `${unresolved} left alone - no confident match, and a wrong pin is worse than none`
        : "",
      apiErrors > 0 ? `${apiErrors} failed at the API: ${firstError}` : "",
      drifted > 0 ? `${drifted} of our pins were more than 150m out` : "",
    ].filter(Boolean),
  };
}
