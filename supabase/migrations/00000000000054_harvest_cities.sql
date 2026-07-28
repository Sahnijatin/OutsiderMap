-- Harvest geography stops being code-only: the built-in registry covers
-- every Indian state's notable cities, and this table holds the ones an
-- admin adds from the console (any town, any state - geocoded on entry).
-- Service-role only, like the rest of the scout tables: the harvest console
-- is an admin surface and RLS stays closed.

create table public.harvest_cities (
  id uuid primary key default gen_random_uuid(),
  state_slug text not null,
  state_name text not null,
  slug text not null unique,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 10000
    check (radius_m between 1000 and 50000),
  -- cities.slug this harvest city publishes into, or null until it goes live.
  product_city text references public.cities(slug) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index harvest_cities_state_idx on public.harvest_cities (state_slug, name);

alter table public.harvest_cities enable row level security;
