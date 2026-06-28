-- Phase 1 (mobile rebuild): the "experience" model.
--
-- The vision reframes the catalog from places to curated *experiences* of many
-- kinds, adds the hard no-chains rule, story content, a bucket lifecycle, a
-- richer interaction taxonomy for learning, and a per-user personalization
-- consent toggle. All changes are additive and backward compatible.

-- ---------------------------------------------------------------------------
-- places: experience kind, no-chains flag, story content
-- ---------------------------------------------------------------------------

alter table public.places
  add column kind text not null default 'spot'
    check (kind in (
      'spot', 'cafe', 'nightlife', 'workshop', 'historical', 'cultural', 'event'
    )),
  -- Product law: chains never surface. Enforced in match_places and queries.
  add column is_chain boolean not null default false,
  -- Ordered story cards: [{ media_path, media_type: 'image'|'video', caption }].
  add column story jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- match_places: same signature, now also excludes chains
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
    and p.is_chain = false
    and p.embedding is not null
    and p.city = filter_city
    and (filter_area is null or p.area = filter_area)
    and (max_price_level is null or p.price_level <= max_price_level)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- saved_places: bucket lifecycle (saved -> started -> completed)
-- ---------------------------------------------------------------------------

alter table public.saved_places
  add column status text not null default 'saved'
    check (status in ('saved', 'started', 'completed'));

-- ---------------------------------------------------------------------------
-- interaction_events: richer taxonomy for the learning loop.
-- 'complete' is the gold signal (they actually did it).
-- ---------------------------------------------------------------------------

alter table public.interaction_events
  drop constraint interaction_events_event_type_check;

alter table public.interaction_events
  add constraint interaction_events_event_type_check
  check (event_type in (
    'query', 'view', 'save', 'unsave', 'rate', 'visit',
    'dismiss', 'plan_add', 'rec_click',
    'start', 'complete', 'bucket_add', 'story_view', 'dwell'
  ));

-- ---------------------------------------------------------------------------
-- profiles: personalization consent toggle (DPDP). Default on; when off,
-- recommendations still work from the questionnaire + context, but behavioral
-- signals are not used.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column personalization_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- experience-media: public-read story media bucket (mirrors place-images)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('experience-media', 'experience-media', true)
on conflict (id) do nothing;

create policy "experience-media: public read"
  on storage.objects for select
  using (bucket_id = 'experience-media');

create policy "experience-media: admin insert"
  on storage.objects for insert
  with check (bucket_id = 'experience-media' and public.is_admin());

create policy "experience-media: admin update"
  on storage.objects for update
  using (bucket_id = 'experience-media' and public.is_admin());

create policy "experience-media: admin delete"
  on storage.objects for delete
  using (bucket_id = 'experience-media' and public.is_admin());
