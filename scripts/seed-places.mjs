/**
 * Seeds the curated Delhi places catalog with embeddings.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
 *     node scripts/seed-places.mjs [--dry-run]
 *
 * Idempotent: upserts by slug, so edits to data/places.delhi.json can be
 * re-applied. Standalone on purpose — does not import src/ (server-only).
 */

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const DRY_RUN = process.argv.includes("--dry-run");
const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 64;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

/** The text a place is matched on. Mirrors the taste/query embedding style. */
function embeddingText(place) {
  const bestFor = place.best_for ?? {};
  return [
    `${place.name} — ${place.category} (${place.kind ?? "spot"}) in ${place.area}, Delhi.`,
    `Vibe: ${place.vibe_tags.join(", ")}.`,
    place.description,
    place.editor_note,
    `Best for moods: ${(bestFor.moods ?? []).join(", ")}.`,
    `Best times: ${(bestFor.times ?? []).join(", ")}. Groups: ${(bestFor.group ?? []).join(", ")}.`,
    `Price level ${place.price_level} of 4.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const places = JSON.parse(
  await readFile(new URL("../data/places.delhi.json", import.meta.url), "utf8"),
);
console.log(`Loaded ${places.length} places from data/places.delhi.json`);

if (DRY_RUN) {
  console.log("Dry run — first embedding text:\n");
  console.log(embeddingText(places[0]));
  process.exit(0);
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);
const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

let upserted = 0;
for (let i = 0; i < places.length; i += BATCH_SIZE) {
  const batch = places.slice(i, i + BATCH_SIZE);
  const { data } = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: batch.map(embeddingText),
  });

  const rows = batch.map((place, j) => ({
    slug: place.slug,
    name: place.name,
    city: place.city,
    area: place.area,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    // Experience model (migration 0006): default kind to 'spot', never-surface
    // chains to false, and story to an empty card list when omitted.
    kind: place.kind ?? "spot",
    is_chain: place.is_chain ?? false,
    story: place.story ?? [],
    price_level: place.price_level,
    vibe_tags: place.vibe_tags,
    description: place.description,
    editor_note: place.editor_note,
    hours: place.hours,
    best_for: place.best_for,
    embedding: JSON.stringify(data[j].embedding),
    is_published: true,
    source: "curated",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("places")
    .upsert(rows, { onConflict: "slug" });
  if (error) {
    console.error(`Upsert failed at batch ${i / BATCH_SIZE}:`, error.message);
    process.exit(1);
  }
  upserted += rows.length;
  console.log(`Upserted ${upserted}/${places.length}`);
}

console.log("Done.");
