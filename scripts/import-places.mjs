/**
 * Loads Overture place candidates into the catalog as unpublished drafts.
 *
 *   1. duckdb -c ".read scripts/overture-extract.sql"     (pull candidates)
 *   2. node scripts/import-places.mjs --city=delhi        (classify + load)
 *
 * Nothing this writes is visible to anyone. Every row lands is_published =
 * false, because Overture gives us a name, a category and a point - it does
 * not give us a reason to go, and a place with no reason to go is what makes
 * a discovery map feel like a phone book. A human writes the editor note and
 * publishes.
 *
 * Usage:
 *   node scripts/import-places.mjs --city=delhi [--dry-run] [--limit=500]
 *
 * Options:
 *   --dry-run     Report the split; write nothing.
 *   --city=slug   City slug rows are filed under (default: delhi).
 *   --limit=N     Stop after N inserts.
 *   --source=path Candidate JSON (default: scripts/out/overture-candidates.json).
 */

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  classifyPlace,
  countByName,
  normaliseName,
} from "../src/lib/places/franchise.ts";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const DRY_RUN = flag("dry-run");
const CITY = value("city", "delhi");
const LIMIT = Number(value("limit", "0")) || 0;
const SOURCE = value("source", "scripts/out/overture-candidates.json");

/** Same name within this distance of an existing row is the same place. */
const DUPE_RADIUS_M = 120;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function haversineM(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Overture's taxonomy mapped onto ours. Anything unmapped becomes a spot. */
const KIND_BY_CATEGORY = {
  restaurant: "spot",
  indian_restaurant: "spot",
  fast_food: "spot",
  street_vendor: "spot",
  food_court: "spot",
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
  park: "spot",
  flea_market: "spot",
  market: "spot",
};

function slugify(name, seed) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56);
  return `${base || "place"}-${seed.slice(0, 6)}`;
}

async function main() {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const candidates = JSON.parse(await readFile(SOURCE, "utf8"));
  console.log(`${candidates.length} candidate(s) from ${SOURCE}\n`);

  // Existing catalog for this city, to dedupe against. A dry run tolerates an
  // unreachable database so a pull can be sized up before credentials exist -
  // the split is still meaningful, only the duplicate count is missing.
  let existing = [];
  try {
    const { data, error } = await supabase
      .from("places")
      .select("id, name, lat, lng")
      .eq("city", CITY);
    if (error) throw new Error(error.message);
    existing = data ?? [];
  } catch (err) {
    if (!DRY_RUN) throw err;
    console.warn(
      `catalog unreachable (${(err instanceof Error ? err.message : err)}) - dry run continues without duplicate detection\n`,
    );
  }

  const existingByName = new Map();
  for (const p of existing) {
    const key = normaliseName(p.name);
    if (!existingByName.has(key)) existingByName.set(key, []);
    existingByName.get(key).push(p);
  }

  // Outlet counts computed once for the whole batch rather than per row.
  const counts = countByName(candidates);

  const stats = {
    inserted: 0,
    chain: 0,
    review: 0,
    duplicate: 0,
    failed: 0,
  };
  // Keyed by normalised name: the same franchise appears once in the report,
  // not once per outlet, so the human pile reads as decisions to make.
  const reviewPile = new Map();

  for (const c of candidates) {
    if (LIMIT && stats.inserted >= LIMIT) break;
    if (!c.name || c.lat == null || c.lng == null) continue;

    const verdict = classifyPlace({
      name: c.name,
      text: [c.category, ...(c.alt_categories ?? [])].filter(Boolean).join(" "),
      outletCount: counts.get(normaliseName(c.name)) ?? 1,
    });

    if (verdict.verdict === "chain") {
      stats.chain += 1;
      continue;
    }
    if (verdict.verdict === "review") {
      // Held back entirely rather than imported flagged: an unreviewed
      // franchise sitting in the catalog is the exact thing the product
      // promises not to have.
      stats.review += 1;
      reviewPile.set(normaliseName(c.name), `${c.name} - ${verdict.reason}`);
      continue;
    }

    const near = (existingByName.get(normaliseName(c.name)) ?? []).some(
      (p) =>
        p.lat != null &&
        haversineM(p.lat, p.lng, c.lat, c.lng) <= DUPE_RADIUS_M,
    );
    if (near) {
      stats.duplicate += 1;
      continue;
    }

    if (DRY_RUN) {
      stats.inserted += 1;
      continue;
    }

    const { error } = await supabase.from("places").insert({
      slug: slugify(c.name, c.overture_id ?? String(stats.inserted)),
      name: c.name,
      city: CITY,
      lat: c.lat,
      lng: c.lng,
      category: c.category ?? null,
      kind: KIND_BY_CATEGORY[c.category] ?? "spot",
      is_chain: false,
      is_published: false,
      source: "ingested",
      geo_source: "overture",
      geo_updated_at: new Date().toISOString(),
    });
    if (error) {
      stats.failed += 1;
      if (stats.failed <= 5) console.error(`  err ${c.name}: ${error.message}`);
      continue;
    }

    // Keep the in-memory index current so two candidates with the same name
    // in the same batch cannot both land.
    const key = normaliseName(c.name);
    if (!existingByName.has(key)) existingByName.set(key, []);
    existingByName.get(key).push({ name: c.name, lat: c.lat, lng: c.lng });
    stats.inserted += 1;
  }

  console.log(`inserted (unpublished)  ${stats.inserted}`);
  console.log(`excluded as chain       ${stats.chain}`);
  console.log(`held for human review   ${stats.review}`);
  console.log(`already in the catalog  ${stats.duplicate}`);
  if (stats.failed) console.log(`failed                  ${stats.failed}`);
  if (DRY_RUN) console.log("\n(dry run - nothing written)");

  if (reviewPile.size > 0) {
    const lines = [...reviewPile.values()].sort();
    console.log(`\nHeld back, ${lines.length} name(s) needing a human call:`);
    for (const line of lines.slice(0, 40)) console.log(`  ${line}`);
    if (lines.length > 40) console.log(`  ... and ${lines.length - 40} more`);
  }

  console.log(
    "\nEvery row is unpublished. They need an editor note before they mean anything.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
