-- Admin-managed map categories: the color language of the map, moved out of a
-- hardcoded TS constant and into a table admins can edit (add a category,
-- change its color, reorder the legend) without a deploy.
--
-- A place points at one category (places.category_id). Pin color, the legend,
-- the place sheet and the detail page all read the category's color. The legacy
-- free-text places.category is kept in sync as the category slug for anything
-- that still reads it, but category_id is the source of truth.

set check_function_bodies = off;

create table public.map_categories (
  id uuid primary key default gen_random_uuid(),
  -- stable key; also written back to places.category so legacy readers keep working.
  slug text unique not null check (slug ~ '^[a-z0-9-]{1,40}$'),
  label text not null,
  -- #rrggbb; the single color used for the pin dot, legend swatch, and chip.
  color text not null check (color ~* '^#[0-9a-f]{6}$'),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index map_categories_active_idx
  on public.map_categories (is_active, sort_order);

alter table public.map_categories enable row level security;

-- Categories are not sensitive and the public place page renders them, so any
-- reader may select; only admins write.
create policy "map_categories: readable by all"
  on public.map_categories for select
  using (true);

create policy "map_categories: admin can write"
  on public.map_categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- Places point at a category. on delete set null so removing a category degrades
-- affected pins to the fallback color rather than deleting places.
alter table public.places
  add column category_id uuid references public.map_categories(id) on delete set null;
create index places_category_id_idx on public.places (category_id);

-- Seed the five groups the map shipped with (previously hardcoded in
-- src/lib/map/categories.ts) as the starting categories.
insert into public.map_categories (slug, label, color, sort_order) values
  ('food',      'Cafés & restaurants', '#f0a431', 1),
  ('nightlife', 'Bars & nightlife',    '#f2749e', 2),
  ('shopping',  'Shopping & markets',  '#b48aed', 3),
  ('culture',   'Culture & art',       '#59c6d6', 4),
  ('outdoors',  'Parks & views',       '#79c98b', 5)
on conflict (slug) do nothing;

-- Backfill existing places onto a category using the same member mapping the
-- old categoryGroup() used (category first, then kind), defaulting to food.
update public.places p
set category_id = mc.id
from public.map_categories mc
where p.category_id is null
  and mc.slug = case
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('restaurant','cafe','street-food','late-night-eats','dessert','chai','bakery')
      then 'food'
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('bar','club','music-venue','nightlife')
      then 'nightlife'
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('market','bookstore','shop','shopping')
      then 'shopping'
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('gallery','experience','cultural','historical','workshop','event','museum')
      then 'culture'
    when lower(coalesce(nullif(p.category, ''), p.kind)) in
      ('park','viewpoint','garden','outdoors')
      then 'outdoors'
    else 'food'
  end;
