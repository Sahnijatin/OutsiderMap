# OutsiderMap — Data Ingestion & Curation Pipeline

> Technical design for the system that fills the catalog. Companion to
> `DEVELOPMENT.md` §4 (Data strategy). Owner-level detail: schema, connector
> contract, entity resolution, the AI curation classifier, the publish gate, the
> crowdsource loop, and a phased build plan.
>
> _Status: design (nothing here is built yet). Last updated: 2026-06-28._

---

## 1. Why this exists

Today the catalog is one hand-written file (`data/places.delhi.json`) loaded by
`scripts/seed-places.mjs`. That doesn't scale to "everything happening in the
city, curated." This pipeline turns **many messy sources** (District,
BookMyShow/Insider, Google, venue Instagrams, user submissions) into **one clean,
de-duplicated, taste-filtered catalog** of `places` and `events` — the same
tables the recommendation brain already reads.

**Two jobs, kept separate:**

- **Coverage** — pull in as much as possible (we go all-in on aggregation).
- **Taste** — most of what we pull is rejected or demoted. The catalog is
  *everything the city has, minus everything you'd never want.* AI enforces that
  filter at scale so curation doesn't bottleneck on humans.

**Hard invariant:** raw aggregated data is **never user-facing**. It lives in a
quarantined `source_records` table and only reaches `places`/`events` after
resolution → enrichment → curation → (auto or human) publish. This is also our
ToS firewall: scraped material is treated as *signal/leads*, and what we publish
is our own resolved, re-described record — not a rehosted copy of a source.

---

## 2. The pipeline at a glance

```
 ┌───────────┐   ┌────────────────┐   ┌─────────────┐   ┌──────────────┐
 │ connectors│──▶│ source_records │──▶│  normalize  │──▶│   entity     │
 │ (per src) │   │  (raw, quar.)  │   │  (to canon) │   │  resolution  │
 └───────────┘   └────────────────┘   └─────────────┘   └──────┬───────┘
                                                               │ cluster → 1 candidate
                                                               ▼
                                  ┌───────────────────────────────────────┐
                                  │ enrich: geocode · hours · dedupe-merge │
                                  └───────────────────┬───────────────────┘
                                                      ▼
                          ┌────────────────────────────────────────────────┐
                          │ AI curation classifier (LLM extract, zod)       │
                          │  chain? obviousness? has-story? vibe? for-whom?  │
                          └───────────────┬────────────────────────────────-┘
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
            reject / park           review queue            auto-publish
          (below taste bar)      (admin vetting UI)      (high confidence)
                                        │                       │
                                        └─────────┬─────────────┘
                                                  ▼
                              embed (pgvector) → places / events
                                                  ▲
                                                  │
                            user submissions ─────┘  (same pipeline, from "review")
```

Every stage is **idempotent** and **resumable** — each record carries a
`pipeline_status` and stages advance it. A re-run never double-publishes (upsert
by canonical key / slug, exactly like the current seed script).

---

## 3. Data model (migration `0008_ingestion`)

New tables sit *beside* the existing catalog. `places`/`events` are unchanged in
shape except for additive provenance + ranking columns.

### 3.1 `sources` — the registry of where data comes from

```sql
create table public.ingest_sources (
  id          text primary key,              -- 'google_places', 'district', 'bms', 'instagram', 'submission'
  name        text not null,
  kind        text not null check (kind in ('api','crawl','manual','submission')),
  trust       smallint not null default 50,  -- 0..100; weights merge conflicts & auto-publish
  is_enabled  boolean not null default true,
  config      jsonb not null default '{}',   -- rate limits, areas, query seeds
  created_at  timestamptz not null default now()
);
```

### 3.2 `source_records` — the raw, quarantined layer

One row per item, per source, exactly as pulled. Never read by the app.

```sql
create table public.source_records (
  id             uuid primary key default gen_random_uuid(),
  source_id      text not null references public.ingest_sources(id),
  external_id    text not null,              -- the id within that source
  url           text,
  entity_type   text not null check (entity_type in ('place','event')),
  raw           jsonb not null,              -- verbatim payload
  -- extracted-but-not-canonical fields, filled by normalize:
  name          text,
  area          text,
  lat           double precision,
  lng           double precision,
  starts_at     timestamptz,                 -- events only
  content_hash  text not null,               -- hash(raw) for change detection
  pipeline_status text not null default 'raw'
    check (pipeline_status in
      ('raw','normalized','resolved','enriched','assessed','published','rejected','parked','error')),
  candidate_id  uuid references public.ingest_candidates(id),
  error         text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (source_id, external_id)
);
create index on public.source_records (pipeline_status);
create index on public.source_records (entity_type, area);
```

`unique (source_id, external_id)` makes re-crawls upserts; `content_hash` flips a
record back to `normalized` when the source changed so it re-flows.

### 3.3 `ingest_candidates` — one resolved entity, many source records

Entity resolution clusters `source_records` into candidates. A candidate is the
merge target; on publish it becomes (or updates) a `places`/`events` row.

```sql
create table public.ingest_candidates (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null check (entity_type in ('place','event')),
  canonical_key text not null,               -- normalized(name)+geocell, dedupe anchor
  merged        jsonb not null default '{}', -- best-of merge across sources
  source_count  int not null default 1,
  assessment    jsonb,                       -- curation classifier output (§5)
  decision      text not null default 'pending'
    check (decision in ('pending','auto_publish','review','reject','parked')),
  place_id      uuid references public.places(id) on delete set null,
  event_id      uuid references public.events(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (entity_type, canonical_key)
);
```

### 3.4 Additive columns on `places` (and mirror on `events`)

```sql
alter table public.places
  -- 0..1; 1 = mainstream/tourist-default/chain-like. A *penalty* in ranking.
  add column obviousness real not null default 0.5,
  -- how many independent sources corroborate this place (popularity signal,
  -- used both for confidence and, inversely, for obviousness)
  add column source_count int not null default 0,
  -- who suggested it, for the crowdsource credit/reputation loop
  add column submitted_by uuid references public.profiles(id) on delete set null;

-- widen the source enum: 'curated' | 'submitted' | 'ingested'
alter table public.places drop constraint places_source_check;
alter table public.places add constraint places_source_check
  check (source in ('curated','submitted','ingested'));
```

### 3.5 Crowdsource reputation

```sql
alter table public.profiles
  add column curator_score int not null default 0;   -- earns credit when a suggestion publishes

create table public.place_provenance (    -- audit: which source_records built a place
  place_id   uuid references public.places(id) on delete cascade,
  source_id  text references public.ingest_sources(id),
  external_id text,
  primary key (place_id, source_id, external_id)
);
```

**RLS:** `ingest_sources`, `source_records`, `ingest_candidates`,
`place_provenance` are **admin-only** (default deny; `is_admin()` for all ops).
They are operational tables — no anon/user access, ever. `places`/`events` RLS is
unchanged (published-or-admin).

---

## 4. The connector contract

Connectors are the only source-specific code. Everything downstream is generic.
A connector's single job: **yield raw records; never decide quality.**

```ts
// src/lib/ingest/types.ts
export interface RawRecord {
  externalId: string;
  url?: string;
  entityType: "place" | "event";
  raw: Record<string, unknown>;     // verbatim
  // best-effort hints; normalize() is the source of truth:
  name?: string;
  area?: string;
  lat?: number; lng?: number;
  startsAt?: string;                // events
}

export interface Connector {
  readonly sourceId: string;        // matches ingest_sources.id
  readonly kind: "api" | "crawl";
  /** Pull a page/batch. `cursor` lets a run resume; return next cursor or null. */
  fetch(ctx: ConnectorCtx, cursor?: string): Promise<{ records: RawRecord[]; cursor: string | null }>;
}
```

- **API connectors** (Google Places, ticketing APIs) — clean, ToS-safe, built
  first. `fetch` calls the API, maps response → `RawRecord[]`.
- **Crawl connectors** (District, BMS/Insider, Instagram) — fetch HTML/JSON,
  extract with cheerio/JSON paths. An LLM `extract` pass can turn messy HTML into
  structured `raw` when a site has no clean structure (use sparingly — it's the
  expensive path).

**Where they run:** standalone Node workers (the `scripts/seed-places.mjs`
pattern — service-role Supabase client, no `src/` server-only imports),
**scheduled by GitHub Actions** (mirror `.github/workflows/migrate.yml`) or
Vercel cron. Crawls are long and bursty — they do **not** belong in serverless
route handlers (timeouts). The worker writes only to `source_records`
(`pipeline_status='raw'`); it does no quality judgement and no embedding.

A run is logged (`ingestion_runs`: source, started/finished, counts,
new/changed/error) for observability and rate-limit backoff.

---

## 5. The stages

Each stage is an idempotent function over rows in a given `pipeline_status`. They
can run in one cron job (`/api/cron/ingest` gated by `CRON_SECRET`, batched) or as
worker steps. Order:

### 5.1 Normalize (`raw → normalized`)
Map source-specific `raw` into canonical fields on `source_records` (name, area
mapped to our `KNOWN_AREAS`, geocode-ready address, `starts_at`). Deterministic;
no LLM. Compute `content_hash`.

### 5.2 Entity resolution (`normalized → resolved`)
Cluster records into `ingest_candidates`:
- **Blocking key** = `slugify(name)` truncated + **geo-cell** (lat/lng rounded to
  ~75 m, e.g. geohash precision 7). Cheap candidate generation.
- **Match score** within a block = name similarity (trigram / `pg_trgm`) +
  distance + (for events) `starts_at` proximity. Above threshold → same
  `canonical_key`; attach `candidate_id`, bump `source_count`.
- Events also key on `(venue, date)` so the same gig across BMS + Instagram +
  District collapses to one.

`pg_trgm` is already available to Postgres; add the extension + a GIN index on
`source_records.name` in this migration.

### 5.3 Enrich + merge (`resolved → enriched`)
Build `ingest_candidates.merged` as a **best-of merge** across the cluster's
records, resolving conflicts by `ingest_sources.trust` (e.g. Google wins on
coordinates/hours, Instagram wins on vibe/imagery). Geocode if missing
(Google Geocoding — the app already loads Google Maps). Normalize hours into the
existing `places.hours` jsonb shape (`src/lib/places/hours.ts` consumes it).

### 5.4 Curation classifier (`enriched → assessed`) — **where AI earns its keep**
One `getAI().extract<Assessment>()` call per candidate, validated by zod (reuses
the existing self-correcting `extract` in `src/lib/ai/`). The prompt gets the
merged record + source list and returns:

```ts
// src/lib/ingest/curation.ts
export const AssessmentSchema = z.object({
  isChain: z.boolean(),                       // franchise / multi-outlet brand
  obviousness: z.number().min(0).max(1),      // tourist-default / everyone-knows-it
  hasStory: z.boolean(),                       // is there a real narrative here?
  outsiderWorthy: z.boolean(),                 // the gate: does it belong in OutsiderMap?
  kind: z.enum(["spot","cafe","nightlife","workshop","historical","cultural","event"]),
  vibeTags: z.array(z.string()).max(8),
  bestFor: z.object({                          // matches places.best_for shape
    moods: z.array(z.string()), times: z.array(z.string()), group: z.array(z.string()),
  }),
  editorNote: z.string().max(280),             // a draft "why it matters" (human-approved)
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200),                 // why this verdict (audit trail)
});
```

**Obviousness is computed, not just vibes.** Final `obviousness` blends the LLM
read with hard signals: `isChain` (→ near 1), `source_count` across *mainstream*
aggregators (more corroboration on tourist platforms ⇒ more obvious), and
known-landmark categories. The LLM handles nuance; the signals keep it honest.

### 5.5 Decision (`assessed → auto_publish | review | reject | parked`)
Pure rules over the assessment:
- `isChain == true` → **reject** (product law; chains never enter the catalog).
- `outsiderWorthy == false` → **park** (kept as signal, not published; may be
  re-considered if more sources corroborate a story).
- `outsiderWorthy && confidence ≥ τ_auto && trust(sources) high` →
  **auto_publish**.
- otherwise → **review** (lands in the admin vetting queue).

`τ_auto` starts conservative (humans review most things) and rises as we trust
the classifier — measured against human overrides.

### 5.6 Publish (`* → published`)
Upsert `ingest_candidates.merged` into `places`/`events` (by `slug` /
canonical key, idempotent — same contract as the seed script), set
`source='ingested'`, `obviousness`, `source_count`, write `place_provenance`,
then **embed** with the existing `placeEmbeddingText` + `getEmbeddings()` so
ranking text stays identical to curated places. `is_published=true` only here.

---

## 6. Ranking integration — the "anti-obvious" payoff

`obviousness` flows into retrieval so the product law is enforced at query time,
not just at ingest. `match_places` gains an obviousness penalty:

```sql
-- ranking score = similarity − λ · obviousness
order by (1 - (p.embedding <=> query_embedding)) - 0.25 * p.obviousness desc
```

- `is_chain = false` stays a hard filter (already in `match_places`).
- `obviousness` is a **soft, constant penalty** — independent of the
  adventurousness dial. (The dial governs *taste-distance*: explore vs. exploit
  around the user's vector — a separate axis handled by the bandit in
  `DEVELOPMENT.md` §5.3. Obviousness is "is this a mainstream-default place,"
  which we always damp.)
- λ is configurable; tune against Confident-Answer-Accept-Rate.

---

## 7. The crowdsource loop (closing the open path)

The current `/submit` writes a bare `places` row (`source='submitted'`,
unpublished) and the admin fleshes it out by hand. Re-point it through the
pipeline so user suggestions get the same AI enrichment and credit:

1. **Submit** → write a `source_records` row (`source_id='submission'`,
   `submitted_by = user`) instead of a half-empty `places` row.
2. It flows through resolve → enrich → **curation classifier**. If the place
   already exists (entity resolution matches), the submission just bumps
   `source_count` and corroborates — no duplicate.
3. New, outsider-worthy submissions land in **review** (never auto-publish UGC at
   first — abuse surface).
4. On publish, set `places.submitted_by` and **+`curator_score`** to the
   suggester. When their pick starts showing up in answers, they get the credit —
   exactly the promise the `/submit` success screen already makes.

This turns submissions from manual data-entry into a **reputation flywheel** and
reuses 100% of the ingestion machinery.

---

## 8. Freshness

- **Places**: re-crawl on a slow cadence (weekly); `content_hash` change →
  re-flow only changed records. Cheap.
- **Events**: perishable. Daily crawl; past events auto-expire (the app already
  filters `starts_at`). "Happening tonight/this weekend" injection into Right Now
  already exists (`recommend.ts` `tonight`) — ingestion just keeps it fed.
- **Backoff**: `ingestion_runs` + per-source rate limits in
  `ingest_sources.config` prevent hammering and getting blocked.

---

## 9. Build plan (phased, concrete)

**Phase A — skeleton + one clean source (highest leverage first).**
1. Migration `0008_ingestion` (§3) + `pg_trgm`.
2. `src/lib/ingest/{types,normalize,resolve,curation,publish}.ts` — the generic
   stages. Curation reuses `src/lib/ai` + zod; publish reuses
   `placeEmbeddingText`.
3. **Google Places connector** (API, ToS-clean) as `scripts/ingest/google.mjs`
   (seed-script pattern) + a GitHub Action on a schedule.
4. `/api/cron/ingest` (gated by `CRON_SECRET`, in `vercel.json`) that advances
   batches through the stages.
5. **Admin vetting queue** — extend `/admin/submissions` (or a new
   `/admin/queue`) to list `ingest_candidates` in `review` with the assessment,
   merged preview, and approve/park/reject. Approve → publish stage.

   *Exit A:* a real source flows end-to-end into the live catalog with a human
   gate; obviousness penalty live in `match_places`.

**Phase B — density + the loop.**
6. Re-point `/submit` through `source_records` (§7) + `curator_score`.
7. Second + third connectors (District for events, then a crawl source).
8. Entity-resolution tuning against real duplicates; auto-publish threshold once
   human-override rate is low.

**Phase C — scale.**
9. Event freshness cadence + expiry; per-source backoff.
10. LLM-assisted extraction for unstructured crawl sources; content-gen assist
    for draft stories (human-approved) — `DEVELOPMENT.md` §5.6.

---

## 10. Risks & decisions

- **ToS / legal (accepted, mitigated).** We go all-in on coverage. Mitigation is
  structural: scraped data stays in `source_records` as *signal*; published rows
  are our own resolved, re-described records with our own editorial note and
  embedding — not rehosted source content. Media is re-hosted/transformed, not
  hotlinked. Revisit per-source as we scale.
- **Classifier drift / false-rejects.** Every auto-decision is logged with
  `reason` + `confidence`; humans can override from the queue; overrides are the
  training signal for raising `τ_auto`. Start human-heavy, automate as trust
  grows.
- **Cost.** One LLM call per *candidate* (not per source record), only on change.
  Embedding only on publish. Both batched. Cheap relative to crawl volume.
- **Duplicate explosion.** Entity resolution is the load-bearing stage; `pg_trgm`
  + geo-cell blocking keeps it O(n) per block. Bad clustering shows up as
  duplicates in the queue — caught by humans early, tuned before auto-publish.

---

## 11. Open questions

1. **First connector:** Google Places (coverage, clean) vs. District (events, the
   freshness hook) vs. Instagram (the underground edge). Recommendation: Google
   first for the resolution/merge harness, District second for the events loop.
2. **Auto-publish ever for UGC?** Proposed: never at first; revisit once
   `curator_score` reputation is trustworthy.
3. **Media handling** — re-host to the `experience-media` bucket vs. reference.
   Recommendation: re-host (ToS firewall + reliability).
