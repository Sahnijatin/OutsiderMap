-- In-console scout harvest: the scout-engine's discover -> gate -> story
-- pipeline moves into the product, run from Admin -> Harvest instead of a
-- laptop CLI. Vercel's function cap means a harvest cannot run in one
-- request, so it is a task queue advanced in small steps (the ingest
-- pattern): an admin creates a run, tasks execute a few per tick while the
-- Harvest page polls, and candidates accumulate for review.
--
-- Control stays entirely with the reviewer: candidates are inert rows until
-- an admin - having seen the evidence, the dedupe matches, and attached
-- media - clicks Approve, which is what creates the live catalog place.

create table public.scout_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  state text not null,
  cities text[] not null,
  categories text[] not null,
  min_rating numeric not null default 4.3,
  min_reviews int not null default 300,
  max_per_query int not null default 60,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scout_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.scout_runs(id) on delete cascade,
  city_slug text not null,
  city_name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null,
  category text not null,
  source text not null check (source in ('google', 'osm')),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed')),
  error text,
  found_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scout_tasks_status_idx on public.scout_tasks (status, created_at);
create index scout_tasks_run_idx on public.scout_tasks (run_id);

create table public.scout_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.scout_runs(id) on delete cascade,
  -- Normalized name+city key so sightings of one physical place from
  -- different sources/categories merge into one reviewable row.
  merge_key text not null,
  name text not null,
  city_slug text not null,
  city_name text not null,
  address text,
  lat double precision,
  lng double precision,
  category text not null,
  rating numeric,
  review_count int,
  price_level int,
  sources text[] not null default '{}',
  story_signals jsonb not null default '[]'::jsonb,
  google_place_id text,
  website text,
  maps_url text,
  score int not null default 0,
  -- Null gate_reason = passed the quality gate; a reason keeps the row
  -- visible (collapsed) so "why isn't X here" stays answerable.
  gate_reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'needs_visit')),
  review_note text,
  place_id uuid references public.places(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, merge_key)
);

create index scout_candidates_review_idx
  on public.scout_candidates (run_id, status, score desc);

-- Media the reviewer attaches BEFORE approval (uploaded photos as storage
-- paths; reels/videos as embed links with attribution). On approve these
-- become place_media rows + the place cover, under the same licence law:
-- an embed is a pointer, never a copy.
create table public.scout_candidate_media (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.scout_candidates(id) on delete cascade,
  kind text not null check (kind in ('image', 'embed')),
  storage_path text,
  source_url text,
  author_name text,
  created_at timestamptz not null default now(),
  constraint scout_media_image_has_file check (kind <> 'image' or storage_path is not null),
  constraint scout_media_embed_has_link check (
    kind <> 'embed' or (source_url is not null and author_name is not null)
  )
);

create index scout_candidate_media_candidate_idx
  on public.scout_candidate_media (candidate_id);

alter table public.scout_runs enable row level security;
alter table public.scout_tasks enable row level security;
alter table public.scout_candidates enable row level security;
alter table public.scout_candidate_media enable row level security;

create policy "scout_runs: admin only" on public.scout_runs
  for all using (public.is_admin()) with check (public.is_admin());
create policy "scout_tasks: admin only" on public.scout_tasks
  for all using (public.is_admin()) with check (public.is_admin());
create policy "scout_candidates: admin only" on public.scout_candidates
  for all using (public.is_admin()) with check (public.is_admin());
create policy "scout_candidate_media: admin only" on public.scout_candidate_media
  for all using (public.is_admin()) with check (public.is_admin());
