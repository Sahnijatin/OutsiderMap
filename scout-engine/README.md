# scout-engine

Standalone place-discovery pipeline, deliberately **outside** the OutsiderMap
app. It exists to feed the product's story-first answers: the concierge can
only tell the story of a place if the catalog carries story-grade data, and
story-grade data starts here - scraped as *evidence*, verified by a *human*,
and only then pushed into the product.

```
state -> cities -> [sources] -> merge/dedup -> quality gate -> story signals
      -> Excel workbook (or Airtable) -> HUMAN VERIFICATION -> product import
```

## Quick start

```bash
cd scout-engine
npm install

# Dry run, no keys, no network - exercises the full pipeline on sample data:
node src/cli.js --state delhi --cities delhi --sources mock

# Real run (needs GOOGLE_MAPS_API_KEY with "Places API (New)" enabled):
# Mac/Linux:
GOOGLE_MAPS_API_KEY=... node src/cli.js \
  --state delhi --cities delhi,gurgaon \
  --categories cafe,restaurant,bakery \
  --min-rating 4.3 --min-reviews 300
# Windows PowerShell:
#   $env:GOOGLE_MAPS_API_KEY="..."
#   node src/cli.js --state delhi --cities delhi,gurgaon --categories cafe,restaurant

node src/cli.js --list     # see all states / cities / categories
node src/cli.js --help
```

> Invoke via `node src/cli.js` directly. `npm run scout -- --state ...` works
> on Mac/Linux, but npm on Windows strips the `--flags` after `--` and the CLI
> receives bare words (it now detects that and tells you the fix).

Output: `out/<state>-<date>.xlsx` with three sheets:

- **Candidates** - sorted by score, one row per unique place, with quoted
  story evidence (`[origin] "An institution since 1948..." (google:review)`)
  and the reviewer workspace: Status dropdown (pending / approved / rejected /
  needs-visit), verified speciality, story draft, Instagram handle, reel
  links, photo links, notes.
- **Rejected (with reasons)** - everything the gate dropped and exactly why
  (chain blocklist, rating below threshold, no rating evidence...).
- **Run** - the run's parameters and any source errors, for reproducibility.

`--airtable` mirrors the Candidates rows into an Airtable base instead
(`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE`).

## Sources - what's real and what's deliberate

| Source | Status | Why |
| --- | --- | --- |
| Google Places API (New) | **Implemented** | The official API: ratings, review counts, price, editorial summaries, top reviews. Legitimate and stable. Needs a key; costs money at volume. |
| OpenStreetMap (Overpass) | **Implemented** | Open, keyless discovery of places ranking-driven sources miss. No ratings, so OSM-only finds need corroboration (or `--keep-unrated` for manual triage). |
| Zomato / District | **Adapter stub** | No public API; scraping violates their ToS and fights anti-bot walls. If you accept the risk, capture data yourself locally (logged-in Playwright session, human-paced) and feed it in via `--zomato-dump dump.json` - the pipeline treats it as one more evidence stream. See `src/sources/zomato.js`. |
| Instagram | **Curation, not scraping** | Scraping IG breaks ToS hard, and OutsiderMap's own media law (place_media: "crediting a creator is not a licence") means copied reels can't ship anyway. The sheet carries handle + reel-link columns the verifier fills; those become **embeds** in the product. |

## The quality gate ("not crap")

- Chain blocklist (Starbucks/CCD/Domino's/... - product law: no chains).
- `--min-rating` (default 4.2) and `--min-reviews` (default 150).
- Cross-source corroboration raises the score; multi-outlet name noise lowers it.
- Story signals (speciality / origin / heritage / craft / vibe sentences found
  in real reviews) raise the score - places with a story surface first,
  because the product's answers are stories.

## What happens after verification

The **approved** rows - with their human-verified speciality, story draft,
and media links - are the import payload for the product (places + editor
notes + `place_media` embeds). That import script is intentionally NOT built
yet: the sheet format needs to survive contact with real verification first.
