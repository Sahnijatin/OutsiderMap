-- Market Intelligence, part 1: the data model + RLS (#68).
--
-- The shopping-intelligence store behind the Planner's "market mode". Three
-- source layers land in one substrate (price_points): an authored playbook
-- (market_category_guides), content mined from public hauls, and first-party
-- user reports - each row carrying source + confidence + recency. The moat is
-- the aggregation over these, weighted by trust x freshness; the hard rule is
-- that a single-source or stale claim is NEVER surfaced as fact (see
-- src/lib/market/intelligence.ts, which owns that logic and is unit-tested).
--
-- All raw price_points stay server-only: no client-facing select policy, so
-- the raw single-source rows never leave trusted code; clients only ever see
-- the aggregate. Published markets/sections/guides/shops are publicly readable;
-- every write is service-role (the ingest pipeline + admin desk), like reels.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- markets: one row per shopping market (Sarojini, Lajpat, Karol Bagh...).
-- ---------------------------------------------------------------------------

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text not null references public.cities(slug),
  area text,
  categories text[] not null default '{}',   -- fashion, ethnic, electronics...
  character text,                             -- editorial "what this market is"
  timings jsonb,
  tips jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
create index markets_city_idx on public.markets (city, is_published);

alter table public.markets enable row level security;

-- Published markets are public; admins see drafts too. Writes are service-role.
create policy "markets: published or admin can read"
  on public.markets for select
  using (is_published or public.is_admin());

-- ---------------------------------------------------------------------------
-- market_sections: lanes / blocks within a market, each with a specialization.
-- ---------------------------------------------------------------------------

create table public.market_sections (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  name text not null,                         -- "A-block", "export back-lane"
  specialization text,
  notes text,
  created_at timestamptz not null default now()
);
create index market_sections_market_idx on public.market_sections (market_id);

alter table public.market_sections enable row level security;

-- Readable when the parent market is (published, or the reader is admin).
create policy "market_sections: readable with parent market"
  on public.market_sections for select
  using (exists (
    select 1 from public.markets m
    where m.id = market_id and (m.is_published or public.is_admin())
  ));

-- ---------------------------------------------------------------------------
-- market_category_guides: the AUTHORED Tier-1 asset - honest price bands +
-- bargaining and quality notes per category. Curated, not a live observation.
-- ---------------------------------------------------------------------------

create table public.market_category_guides (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  category text not null,
  price_band_low int,
  price_band_high int,
  bargaining_note text,                       -- "quote 40%, settle ~60%, walk once"
  quality_note text,
  confidence real not null default 0.5,
  updated_at timestamptz not null default now(),
  unique (market_id, category)
);
create index market_category_guides_market_idx
  on public.market_category_guides (market_id, category);

alter table public.market_category_guides enable row level security;

create policy "market_category_guides: readable with parent market"
  on public.market_category_guides for select
  using (exists (
    select 1 from public.markets m
    where m.id = market_id and (m.is_published or public.is_admin())
  ));

-- ---------------------------------------------------------------------------
-- shops: sparse and grows; only ever named to a member once corroborated. The
-- `verified` flag and `confidence` gate whether a shop is safe to surface.
-- ---------------------------------------------------------------------------

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  section_id uuid references public.market_sections(id) on delete set null,
  name text,
  shop_number text,
  categories text[] not null default '{}',
  verified boolean not null default false,
  confidence real not null default 0.3,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
create index shops_market_idx on public.shops (market_id);

alter table public.shops enable row level security;

create policy "shops: readable with parent market"
  on public.shops for select
  using (exists (
    select 1 from public.markets m
    where m.id = market_id and (m.is_published or public.is_admin())
  ));

-- ---------------------------------------------------------------------------
-- price_points: the aggregation substrate. Every observation from all three
-- source layers lands here with its source, confidence, and recency. This
-- table is SERVER-ONLY: no client select policy (admins get read for the
-- audit desk; the service role bypasses RLS). Raw single-source rows must
-- never reach a client - only the aggregate in intelligence.ts does.
-- ---------------------------------------------------------------------------

create table public.price_points (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  section_id uuid references public.market_sections(id) on delete set null,
  shop_id uuid references public.shops(id) on delete set null,
  category text,
  item text,
  price int,
  currency text not null default 'INR',
  source text not null check (source in ('authored', 'content_mined', 'user_report')),
  source_ref text,                            -- ingest_items.id / url / post id
  confidence real not null default 0.5,
  status text not null default 'published'
    check (status in ('pending', 'published', 'rejected')),
  observed_at timestamptz,                     -- recency for decay
  created_at timestamptz not null default now()
);
-- The aggregation query path: by market + category, newest first.
create index price_points_market_category_idx
  on public.price_points (market_id, category, observed_at desc);

alter table public.price_points enable row level security;

-- Admin-only direct read (audit). No client read: the raw rows are server-only;
-- members only ever see the aggregate. No write policies: service-role only.
create policy "price_points: admin can read"
  on public.price_points for select
  using (public.is_admin());
