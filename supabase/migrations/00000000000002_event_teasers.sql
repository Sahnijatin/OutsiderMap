-- Event teasers: the conversion surface. RLS (correctly) hides premium
-- events from free users entirely, so the blurred/locked teaser cards need
-- a security-definer function that exposes only non-identifying fields —
-- enough to make the night feel real, never enough to find the party.

create or replace function public.event_teasers(max_count int default 8)
returns table (
  id uuid,
  area text,
  starts_at timestamptz,
  vibe_tags text[],
  is_underground boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select e.id, e.area, e.starts_at, e.vibe_tags, e.is_underground
  from public.events e
  where e.is_published = true
    and e.required_tier = 'premium'
    and e.starts_at > now()
  order by e.starts_at
  limit max_count;
$$;
