/**
 * Seeds the curated Delhi catalog with embeddings.
 *
 * Reads two files and upserts both:
 *   - data/places.delhi.json       (restaurants/spots; default kind 'spot')
 *   - data/experiences.delhi.json  (kinds + story cards: workshops, historical,
 *                                   cultural, cafe, nightlife, ...)
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
 *     node scripts/seed-places.mjs [--dry-run]
 *
 * Idempotent: upserts by slug, so edits can be re-applied. Standalone on
 * purpose - does not import src/ (server-only). Branded cover art is generated
 * for experiences when `sharp` is installed (best-effort; otherwise skipped).
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
  const story = Array.isArray(place.story)
    ? place.story.map((c) => c.caption).filter(Boolean).join(" ")
    : "";
  return [
    `${place.name} - ${place.category ?? place.kind ?? "experience"} in ${place.area ?? "Delhi"}, Delhi.`,
    place.kind && place.kind !== "spot" ? `Kind: ${place.kind}.` : null,
    place.vibe_tags?.length ? `Vibe: ${place.vibe_tags.join(", ")}.` : null,
    place.description,
    place.editor_note,
    bestFor.moods?.length ? `Best for moods: ${bestFor.moods.join(", ")}.` : null,
    bestFor.times?.length || bestFor.group?.length
      ? `Best times: ${(bestFor.times ?? []).join(", ")}. Groups: ${(bestFor.group ?? []).join(", ")}.`
      : null,
    place.price_level ? `Price level ${place.price_level} of 4.` : null,
    story ? `Story: ${story}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadJson(relPath) {
  return JSON.parse(
    await readFile(new URL(`../${relPath}`, import.meta.url), "utf8"),
  );
}

const places = await loadJson("data/places.delhi.json");
const experiences = await loadJson("data/experiences.delhi.json");

// Some experiences are curated upgrades of existing places (same slug).
// Merge by slug — experience fields (kind, story, description) win, place
// fields (hours, price) survive where the experience omits them. A duplicate
// slug inside one upsert batch is also a hard Postgres error
// ("cannot affect row a second time"), so the catalog must be unique.
const bySlug = new Map();
for (const entry of [...places, ...experiences]) {
  const prev = bySlug.get(entry.slug);
  bySlug.set(entry.slug, prev ? { ...prev, ...entry } : entry);
}
const catalog = [...bySlug.values()];
console.log(
  `Loaded ${places.length} places + ${experiences.length} experiences = ` +
    `${catalog.length} unique rows (${places.length + experiences.length - catalog.length} merged)`,
);

if (DRY_RUN) {
  console.log("\nDry run - sample experience embedding text:\n");
  console.log(embeddingText(experiences[0]));
  process.exit(0);
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);
const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

// Optional: branded cover art for experiences (skipped if sharp isn't installed).
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.log("(sharp not installed - skipping generated cover art)");
}

/** Deterministic on-brand cover: amber halo + scattered lights on night. */
function coverSvg(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const W = 1200, H = 800, cx = W / 2, cy = H / 2;
  const accent = h % 2 === 0 ? "#f0a431" : "#c87c1f";
  const dots = Array.from({ length: 30 }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    const a = ((h % 1000) / 1000) * Math.PI * 2;
    const r = 80 + (h % 360);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.66;
    const rad = 2 + (h % 5);
    const op = (0.15 + ((h % 6) * 0.08)).toFixed(2);
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad}" fill="${accent}" opacity="${op}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#0c0a08"/>
    <defs><radialGradient id="g" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.42"/>
      <stop offset="55%" stop-color="${accent}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient></defs>
    <ellipse cx="${cx}" cy="${cy}" rx="${W * 0.5}" ry="${H * 0.5}" fill="url(#g)"/>
    ${dots}
    <circle cx="${cx}" cy="${cy}" r="20" fill="${accent}"/>
  </svg>`;
}

async function uploadCover(slug) {
  if (!sharp) return null;
  try {
    const buf = await sharp(Buffer.from(coverSvg(slug))).png().toBuffer();
    const path = `places/${slug}.png`;
    const { error } = await supabase.storage
      .from("place-images")
      .upload(path, buf, { contentType: "image/png", upsert: true });
    if (error) {
      console.warn(`  cover upload failed (${slug}): ${error.message}`);
      return null;
    }
    return path;
  } catch (e) {
    console.warn(`  cover gen failed (${slug}): ${e.message}`);
    return null;
  }
}

// Existing image paths, so a re-seed never clobbers an admin-uploaded image.
// (Bulk upsert sends the UNION of keys per batch — rows missing a key become
// explicit NULLs, so every row must carry every column with a real value.)
const { data: existingRows, error: existingError } = await supabase
  .from("places")
  .select("slug, image_path");
if (existingError) {
  console.error("Could not read existing places:", existingError.message);
  process.exit(1);
}
const existingImages = new Map(
  (existingRows ?? []).map((r) => [r.slug, r.image_path]),
);

let upserted = 0;
for (let i = 0; i < catalog.length; i += BATCH_SIZE) {
  const batch = catalog.slice(i, i + BATCH_SIZE);
  const { data } = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: batch.map(embeddingText),
  });

  const rows = await Promise.all(
    batch.map(async (place, j) => {
      // Generate a cover only for entries that have story cards and no image
      // yet; existing images always win.
      const hasStory = Array.isArray(place.story) && place.story.length > 0;
      const existingImage = existingImages.get(place.slug) ?? null;
      const imagePath =
        hasStory && !existingImage ? await uploadCover(place.slug) : null;
      return {
        slug: place.slug,
        name: place.name,
        city: place.city ?? "delhi",
        area: place.area ?? null,
        lat: place.lat ?? null,
        lng: place.lng ?? null,
        category: place.category ?? null,
        price_level: place.price_level ?? null,
        vibe_tags: place.vibe_tags ?? [],
        description: place.description ?? null,
        editor_note: place.editor_note ?? null,
        hours: place.hours ?? null,
        best_for: place.best_for ?? null,
        embedding: JSON.stringify(data[j].embedding),
        is_published: true,
        source: "curated",
        kind: place.kind ?? "spot",
        is_chain: place.is_chain ?? false,
        story: Array.isArray(place.story) ? place.story : [],
        image_path: imagePath ?? existingImage,
        updated_at: new Date().toISOString(),
      };
    }),
  );

  const { error } = await supabase
    .from("places")
    .upsert(rows, { onConflict: "slug" });
  if (error) {
    console.error(`Upsert failed at batch ${i / BATCH_SIZE}:`, error.message);
    process.exit(1);
  }
  upserted += rows.length;
  console.log(`Upserted ${upserted}/${catalog.length}`);
}

console.log("Done.");
