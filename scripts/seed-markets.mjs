/**
 * Seeds the Delhi v1 market intelligence (#68): flagship markets with authored
 * playbooks (lanes + category price bands + bargaining notes) and an initial
 * content-mined price pass, so day-one shopping plans have real, corroborated
 * data instead of empty bands.
 *
 * Reads data/markets.<city>.json (default city: delhi) and upserts markets,
 * sections, category guides, and price_points. A new city needs only a new
 * data file - no code change - which is the #68 generalization requirement.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/seed-markets.mjs [city] [--dry-run]
 *   e.g. `node scripts/seed-markets.mjs mumbai` reads data/markets.mumbai.json
 *
 * Idempotent: markets upsert by slug and guides by (market_id, category);
 * sections and the seeded price_points are replaced per market on each run
 * (price_points only where source_ref starts with 'seed:', so real user/mined
 * data is never touched). Standalone on purpose - does not import src/.
 *
 * Seeded price_points are content_mined + published and SHOPLESS: the seed
 * corroborates bands, it never names a shop (that needs independent
 * verification, per src/lib/market/intelligence.ts).
 */

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");
// First non-flag arg is the city; defaults to delhi. New city = new data file.
const CITY = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "delhi";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

/** Fuzzy recency cue -> a conservative observed_at, mirroring market-intel.ts. */
function recencyToObservedAt(recency, now) {
  const days = { recent: 7, weeks: 21, months: 75, unknown: null }[recency] ?? null;
  return days == null ? null : new Date(now - days * 86_400_000).toISOString();
}

function minedConfidence(label) {
  return { high: 0.7, medium: 0.5, low: 0.3 }[label] ?? 0.4;
}

async function loadJson(relPath) {
  return JSON.parse(await readFile(new URL(`../${relPath}`, import.meta.url), "utf8"));
}

const dataFile = `data/markets.${CITY}.json`;
const markets = await loadJson(dataFile).catch(() => {
  console.error(`No seed file for city "${CITY}" (expected ${dataFile}).`);
  process.exit(1);
});

const totals = markets.reduce(
  (acc, m) => ({
    sections: acc.sections + (m.sections?.length ?? 0),
    guides: acc.guides + (m.guides?.length ?? 0),
    points: acc.points + (m.price_points?.length ?? 0),
  }),
  { sections: 0, guides: 0, points: 0 },
);
console.log(
  `Loaded ${markets.length} markets: ${totals.sections} sections, ` +
    `${totals.guides} guides, ${totals.points} seed price points.`,
);

if (DRY_RUN) {
  console.log("\nDry run - no writes. Markets:");
  for (const m of markets) {
    console.log(
      `  ${m.slug.padEnd(16)} ${m.sections?.length ?? 0} lanes, ` +
        `${m.guides?.length ?? 0} guides, ${m.price_points?.length ?? 0} points`,
    );
  }
  process.exit(0);
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

const now = Date.now();
let seededMarkets = 0;
let seededPoints = 0;

for (const m of markets) {
  // 1) Market (upsert by slug).
  const { data: market, error: marketErr } = await supabase
    .from("markets")
    .upsert(
      {
        slug: m.slug,
        name: m.name,
        city: m.city ?? CITY,
        area: m.area ?? null,
        categories: m.categories ?? [],
        character: m.character ?? null,
        timings: m.timings ?? null,
        tips: m.tips ?? null,
        is_published: true,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (marketErr) {
    console.error(`  ${m.slug}: market upsert failed - ${marketErr.message}`);
    process.exit(1);
  }
  const marketId = market.id;

  // 2) Sections (replace per market - no natural unique key).
  await supabase.from("market_sections").delete().eq("market_id", marketId);
  const sections = m.sections ?? [];
  if (sections.length) {
    const { error } = await supabase.from("market_sections").insert(
      sections.map((s) => ({
        market_id: marketId,
        name: s.name,
        specialization: s.specialization ?? null,
        notes: s.notes ?? null,
      })),
    );
    if (error) {
      console.error(`  ${m.slug}: sections failed - ${error.message}`);
      process.exit(1);
    }
  }

  // 3) Category guides (upsert by market_id + category).
  const guides = m.guides ?? [];
  if (guides.length) {
    const { error } = await supabase.from("market_category_guides").upsert(
      guides.map((g) => ({
        market_id: marketId,
        category: g.category,
        price_band_low: g.price_band_low ?? null,
        price_band_high: g.price_band_high ?? null,
        bargaining_note: g.bargaining_note ?? null,
        quality_note: g.quality_note ?? null,
        confidence: g.confidence ?? 0.5,
        updated_at: new Date(now).toISOString(),
      })),
      { onConflict: "market_id,category" },
    );
    if (error) {
      console.error(`  ${m.slug}: guides failed - ${error.message}`);
      process.exit(1);
    }
  }

  // 4) Seeded price points (replace only our own seed rows; keep real data).
  await supabase
    .from("price_points")
    .delete()
    .eq("market_id", marketId)
    .like("source_ref", "seed:%");
  const points = m.price_points ?? [];
  if (points.length) {
    const { error } = await supabase.from("price_points").insert(
      points.map((p, i) => ({
        market_id: marketId,
        shop_id: null,
        category: p.category,
        item: p.item ?? null,
        price: p.price,
        currency: "INR",
        source: "content_mined",
        source_ref: `seed:${m.slug}:${i}`,
        confidence: minedConfidence(p.confidence),
        status: "published",
        observed_at: recencyToObservedAt(p.recency ?? "unknown", now),
      })),
    );
    if (error) {
      console.error(`  ${m.slug}: price points failed - ${error.message}`);
      process.exit(1);
    }
    seededPoints += points.length;
  }

  seededMarkets += 1;
  console.log(`  seeded ${m.slug} (${sections.length} lanes, ${points.length} points)`);
}

console.log(`\nDone: ${seededMarkets} markets, ${seededPoints} seed price points.`);
