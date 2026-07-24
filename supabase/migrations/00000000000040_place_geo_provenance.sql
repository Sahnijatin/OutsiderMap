-- Place geo provenance: know how good each pin is, and navigate to the exact
-- venue instead of guessing.
--
-- Two separate problems this fixes.
--
-- 1. Navigation was a text search. `googleMapsDirUrl` handed Google the string
--    "Karim's 28.6494,77.2335" and let its fuzzy matcher pick a venue. There
--    are a dozen Karim's in Delhi. `google_place_id` makes the destination
--    exact - it is also the one Google Maps Platform field that may be cached
--    indefinitely, so it is the only Google-sourced value we store.
--
-- 2. Every coordinate in the catalog was typed by hand from memory, and
--    nothing recorded that. A pin surveyed on-site by three scouts and a pin
--    somebody eyeballed looked identical to the app and to us. Provenance is
--    now a column, so accuracy is measurable rather than assumed.

alter table public.places
  add column if not exists google_place_id text,
  add column if not exists geo_source text not null default 'typed'
    check (geo_source in ('typed', 'osm', 'overture', 'scout_median', 'owner')),
  add column if not exists geo_accuracy_m double precision,
  add column if not exists geo_confirmed_count int not null default 0,
  add column if not exists geo_updated_at timestamptz;

comment on column public.places.google_place_id is
  'Google Maps place_id. Cacheable indefinitely under Maps Platform terms; used only as the navigation destination, never to populate other fields.';
comment on column public.places.geo_source is
  'Where lat/lng came from. ''typed'' is a hand-entered guess and should be treated as unverified.';
comment on column public.places.geo_accuracy_m is
  'Radius in metres we believe the pin is good to. Null when unknown.';
comment on column public.places.geo_confirmed_count is
  'Number of independent on-site scout confirmations behind this pin.';

-- One place per Google venue. Partial so the 110 rows that have no place_id
-- yet do not collide with each other on null.
create unique index if not exists places_google_place_id_idx
  on public.places (google_place_id)
  where google_place_id is not null;

-- The backfill and audit surfaces both want "which pins are still guesses".
create index if not exists places_geo_source_idx
  on public.places (geo_source)
  where is_published = true;
