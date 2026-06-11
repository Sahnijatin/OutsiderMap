-- OutsiderMap — initial schema (profiling-first rebuild)
-- Applied to a live Supabase project in Phase 2.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- Helper functions below reference tables defined later in this file.
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Helper functions (security definer to avoid recursive RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_premium()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = auth.uid()
      and tier = 'premium'
      and status = 'active'
      and current_period_end > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  home_area text,
  is_admin boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner or admin can read"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles: owner can update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = false);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- subscriptions — written only by webhook handlers via service role
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  provider text not null default 'razorpay',
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions: owner can read"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- taste_profiles — the core asset
-- ---------------------------------------------------------------------------

create table public.taste_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  quiz_answers jsonb not null default '{}'::jsonb,
  learned_signals jsonb not null default '{}'::jsonb,
  taste_summary text,
  embedding vector(1536),
  version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.taste_profiles enable row level security;

create policy "taste_profiles: owner can read"
  on public.taste_profiles for select
  using (user_id = auth.uid());

create policy "taste_profiles: owner can insert"
  on public.taste_profiles for insert
  with check (user_id = auth.uid());

-- Owners may update quiz answers; learned_signals/taste_summary/embedding
-- are recomputed server-side via service role (which bypasses RLS).
create policy "taste_profiles: owner can update quiz answers"
  on public.taste_profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- places — curated location catalog
-- ---------------------------------------------------------------------------

create table public.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  city text not null default 'delhi',
  area text,
  lat double precision,
  lng double precision,
  category text,
  price_level smallint check (price_level between 1 and 4),
  vibe_tags text[] not null default '{}',
  description text,
  editor_note text,
  hours jsonb,
  best_for jsonb,
  image_path text,
  embedding vector(1536),
  is_published boolean not null default false,
  source text not null default 'curated' check (source in ('curated', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index places_city_area_idx on public.places (city, area);
create index places_vibe_tags_idx on public.places using gin (vibe_tags);
create index places_embedding_idx on public.places
  using hnsw (embedding vector_cosine_ops);

alter table public.places enable row level security;

create policy "places: published readable by everyone"
  on public.places for select
  using (is_published = true or public.is_admin());

create policy "places: admin can write"
  on public.places for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- events — including underground/premium
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references public.places(id) on delete set null,
  title text not null,
  description text,
  venue_name text,
  area text,
  lat double precision,
  lng double precision,
  starts_at timestamptz not null,
  ends_at timestamptz,
  vibe_tags text[] not null default '{}',
  is_underground boolean not null default false,
  required_tier text not null default 'free' check (required_tier in ('free', 'premium')),
  ticket_url text,
  image_path text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at);

alter table public.events enable row level security;

create policy "events: published readable by tier"
  on public.events for select
  using (
    public.is_admin()
    or (
      is_published = true
      and (required_tier = 'free' or public.is_premium())
    )
  );

create policy "events: admin can write"
  on public.events for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- saved_places
-- ---------------------------------------------------------------------------

create table public.saved_places (
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

alter table public.saved_places enable row level security;

create policy "saved_places: owner full access"
  on public.saved_places for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- interaction_events — append-only signal log feeding the learning loop
-- ---------------------------------------------------------------------------

create table public.interaction_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'query', 'view', 'save', 'unsave', 'rate', 'visit',
    'dismiss', 'plan_add', 'rec_click'
  )),
  place_id uuid references public.places(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index interaction_events_user_idx
  on public.interaction_events (user_id, created_at desc);

alter table public.interaction_events enable row level security;

create policy "interaction_events: owner can read"
  on public.interaction_events for select
  using (user_id = auth.uid());

-- Insert only — no update/delete policies makes the log append-only
-- by construction for regular users.
create policy "interaction_events: owner can insert"
  on public.interaction_events for insert
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- weekend_plans
-- ---------------------------------------------------------------------------

create table public.weekend_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  weekend_start date not null,
  status text not null default 'draft' check (status in ('draft', 'final')),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index weekend_plans_user_idx on public.weekend_plans (user_id, weekend_start desc);

alter table public.weekend_plans enable row level security;

create policy "weekend_plans: owner full access"
  on public.weekend_plans for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- match_places — vector similarity search without exposing embeddings
-- ---------------------------------------------------------------------------

create or replace function public.match_places(
  query_embedding vector(1536),
  match_count int default 10,
  filter_city text default 'delhi',
  filter_area text default null,
  max_price_level smallint default null
)
returns table (
  id uuid,
  slug text,
  name text,
  area text,
  category text,
  price_level smallint,
  vibe_tags text[],
  description text,
  editor_note text,
  similarity float
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id, p.slug, p.name, p.area, p.category, p.price_level,
    p.vibe_tags, p.description, p.editor_note,
    1 - (p.embedding <=> query_embedding) as similarity
  from public.places p
  where p.is_published = true
    and p.embedding is not null
    and p.city = filter_city
    and (filter_area is null or p.area = filter_area)
    and (max_price_level is null or p.price_level <= max_price_level)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;
