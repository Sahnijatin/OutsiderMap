#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { CATEGORIES, STATES, resolveTargets } from "./registry.js";
import { runCity } from "./pipeline.js";
import { writeWorkbook } from "./export/excel.js";
import { pushToAirtable } from "./export/airtable.js";
import { createGoogleSource } from "./sources/google.js";
import { createOsmSource } from "./sources/osm.js";
import { createZomatoSource } from "./sources/zomato.js";
import { createMockSource } from "./sources/mock.js";

const HELP = `
scout-engine - multi-source place discovery for manual verification

Usage:
  npm run scout -- --state delhi [--cities delhi,gurgaon] [options]
  npm run scout -- --list

Options:
  --state <slug>        State to scout (required unless --list)
  --cities <a,b,c>      City slugs within the state (default: all)
  --categories <a,b>    ${Object.keys(CATEGORIES).join(", ")} (default: cafe,restaurant)
  --min-rating <n>      Quality gate: minimum rating (default 4.2)
  --min-reviews <n>     Quality gate: minimum review count (default 150)
  --keep-unrated        Keep uncorroborated OSM-only finds for manual triage
  --sources <a,b>       google,osm,mock (default: google,osm; mock = dry run)
  --zomato-dump <path>  Local Zomato evidence dump (see sources/zomato.js)
  --max-per-query <n>   Cap per source x city x category (default 40)
  --out <path>          Output workbook (default out/<state>-<date>.xlsx)
  --airtable            Also push candidates to Airtable (env vars required)
  --list                Print known states, cities, categories and exit

Env:
  GOOGLE_MAPS_API_KEY   Enables the Google Places source (official API)
  AIRTABLE_API_KEY / AIRTABLE_BASE_ID / AIRTABLE_TABLE   For --airtable
`;

let parsed;
try {
  parsed = parseArgs({
    options: {
    state: { type: "string" },
    cities: { type: "string" },
    categories: { type: "string", default: "cafe,restaurant" },
    "min-rating": { type: "string", default: "4.2" },
    "min-reviews": { type: "string", default: "150" },
    "keep-unrated": { type: "boolean", default: false },
    sources: { type: "string", default: "google,osm" },
    "zomato-dump": { type: "string" },
    "max-per-query": { type: "string", default: "40" },
    out: { type: "string" },
    airtable: { type: "boolean", default: false },
      list: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
} catch (err) {
  if (err?.code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") {
    // The classic Windows/PowerShell trap: `npm run scout -- --state delhi`
    // arrives here as bare positionals because npm swallowed the flags.
    console.error(
      [
        `Got a bare argument ("${err.message.match(/'([^']+)'/)?.[1] ?? "?"}") where a --flag was expected.`,
        "",
        "If you ran this through `npm run scout -- ...` on Windows, npm likely",
        "stripped the flags. Run node directly instead:",
        "",
        "  node src/cli.js --state delhi --cities delhi,gurgaon --categories cafe,restaurant",
        "",
        "See --help for all flags.",
      ].join("\n"),
    );
    process.exit(1);
  }
  throw err;
}
const { values } = parsed;

if (values.help) {
  console.log(HELP);
  process.exit(0);
}
if (values.list) {
  for (const [slug, s] of Object.entries(STATES)) {
    console.log(`${slug} (${s.name}): ${Object.keys(s.cities).join(", ")}`);
  }
  console.log(`categories: ${Object.keys(CATEGORIES).join(", ")}`);
  process.exit(0);
}
if (!values.state) {
  console.error("Missing --state. Try --list to see options, --help for usage.");
  process.exit(1);
}

const categories = values.categories.split(",").map((c) => c.trim());
for (const c of categories) {
  if (!CATEGORIES[c]) {
    console.error(`Unknown category "${c}". Known: ${Object.keys(CATEGORIES).join(", ")}`);
    process.exit(1);
  }
}

const targets = resolveTargets(
  values.state,
  values.cities ? values.cities.split(",").map((c) => c.trim()) : null,
);

const wantedSources = values.sources.split(",").map((s) => s.trim());
const sources = [];
if (wantedSources.includes("mock")) sources.push(createMockSource());
if (wantedSources.includes("google")) {
  const google = createGoogleSource({
    apiKey: process.env.GOOGLE_MAPS_API_KEY,
    maxPerQuery: Number(values["max-per-query"]),
  });
  if (google) sources.push(google);
  else console.warn("! GOOGLE_MAPS_API_KEY not set - skipping the google source.");
}
if (wantedSources.includes("osm")) sources.push(createOsmSource());
const zomato = createZomatoSource({ dumpPath: values["zomato-dump"] });
if (zomato) sources.push(zomato);
if (sources.length === 0) {
  console.error("No usable sources. Set GOOGLE_MAPS_API_KEY, or use --sources mock for a dry run.");
  process.exit(1);
}

const gate = {
  minRating: Number(values["min-rating"]),
  minReviews: Number(values["min-reviews"]),
  keepUnrated: values["keep-unrated"],
};

const accepted = [];
const rejected = [];
const errors = [];
for (const city of targets) {
  console.log(`\nScouting ${city.name} (${city.state})...`);
  const result = await runCity(city, {
    sources,
    categories,
    gate,
    log: (m) => console.log(m),
  });
  accepted.push(...result.accepted);
  rejected.push(...result.rejected);
  errors.push(...result.errors);
}

// Time in the default name: two runs the same day must not collide, and the
// morning's file being open in Excel must not lock the afternoon's run out.
const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
const outPath = values.out ?? path.join("out", `${values.state}-${stamp}.xlsx`);
await mkdir(path.dirname(outPath), { recursive: true });
const workbook = {
  accepted,
  rejected,
  errors,
  runMeta: {
    state: values.state,
    cities: targets.map((t) => t.slug).join(", "),
    categories: categories.join(", "),
    sources: sources.map((s) => s.name).join(", "),
    gate: `rating >= ${gate.minRating}, reviews >= ${gate.minReviews}${gate.keepUnrated ? ", keeping unrated" : ""}`,
    ranAt: new Date().toISOString(),
    accepted: accepted.length,
    rejected: rejected.length,
  },
};
// A scrape is minutes of API calls held only in memory - it must NEVER die on
// the final write (the classic: the target file is open in Excel and Windows
// locks it, EBUSY). Any write failure falls back to a fresh sibling name.
let wrotePath = outPath;
try {
  await writeWorkbook(outPath, workbook);
} catch (err) {
  const alt = outPath.replace(/(\.xlsx)?$/i, `-${Date.now()}.xlsx`);
  console.warn(
    `! Could not write ${outPath} (${err?.code ?? err?.message ?? err}) - ` +
      `likely open in Excel. Saving to ${alt} instead.`,
  );
  await writeWorkbook(alt, workbook);
  wrotePath = alt;
}
console.log(`\nWrote ${accepted.length} candidates (+${rejected.length} rejects) to ${wrotePath}`);

if (values.airtable) {
  const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE } = process.env;
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE) {
    console.error("--airtable set but AIRTABLE_API_KEY / AIRTABLE_BASE_ID / AIRTABLE_TABLE missing.");
    process.exit(1);
  }
  const pushed = await pushToAirtable(accepted, {
    apiKey: AIRTABLE_API_KEY,
    baseId: AIRTABLE_BASE_ID,
    table: AIRTABLE_TABLE,
  });
  console.log(`Pushed ${pushed} candidates to Airtable.`);
}
