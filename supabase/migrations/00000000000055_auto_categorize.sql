-- Auto-categorization at extraction time.
--
-- 1. scout_candidates learns to carry its classification evidence (Google
--    Places types, OSM tags) so approve can assign the product category
--    without a human. Shape: { google_primary_type, google_types[], osm{} }.
-- 2. place_categories: a place can belong to several legend groups (a
--    restaurant inside a park is food AND outdoors). places.category_id
--    stays the PRIMARY group and alone drives the pin color; the junction
--    holds every membership for browsing surfaces.
-- 3. Backfill: every automated intake path to date left category_id null
--    (amber pins). Re-run migration 33's token mapping, extended with the
--    harvest slugs. No ELSE - a row nothing matches stays honestly amber.

alter table public.scout_candidates
  add column type_signals jsonb not null default '{}'::jsonb;

create table public.place_categories (
  place_id uuid not null references public.places(id) on delete cascade,
  category_id uuid not null references public.map_categories(id) on delete cascade,
  primary key (place_id, category_id)
);

create index place_categories_category_idx on public.place_categories (category_id);

alter table public.place_categories enable row level security;

create policy "place_categories: read" on public.place_categories
  for select using (true);
create policy "place_categories: admin write" on public.place_categories
  for all using (public.is_admin()) with check (public.is_admin());

update public.places p
set category_id = mc.id
from public.map_categories mc
where p.category_id is null
  and mc.slug = case
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('restaurant', 'cafe', 'street-food', 'late-night-eats', 'dessert', 'chai',
       'bakery', 'ice-cream', 'food-court', 'sweets', 'food')
      then 'food'
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('bar', 'club', 'music-venue', 'nightlife', 'pub')
      then 'nightlife'
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('market', 'bookstore', 'shop', 'shopping', 'bazaar')
      then 'shopping'
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('gallery', 'experience', 'cultural', 'historical', 'workshop', 'event',
       'museum', 'historic', 'monument', 'culture')
      then 'culture'
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('park', 'viewpoint', 'garden', 'outdoors')
      then 'outdoors'
  end;

-- Seed the junction with each place's primary (runs after the backfill).
insert into public.place_categories (place_id, category_id)
select id, category_id from public.places where category_id is not null
on conflict do nothing;
