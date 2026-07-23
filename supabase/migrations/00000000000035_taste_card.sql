-- Shareable taste card (#121): the "here's OutsiderMap's read on me" artifact.
--
-- taste_profiles is owner-only RLS, so a public card is opt-in: a member flips
-- profiles.taste_card_public, and only then does the security-definer
-- public_taste_card() expose the public-safe subset (summary + vibe keywords +
-- identity) by username to anyone — including anonymous visitors following a
-- shared link. Nothing is public until the owner chooses it.

set check_function_bodies = off;

alter table public.profiles
  add column taste_card_public boolean not null default false;

-- Owner-only toggle. security definer so it works for admins too (the
-- "profiles: owner can update" policy's `is_admin = false` check would otherwise
-- block an admin from updating their own row).
create or replace function public.set_taste_card_public(p_public boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set taste_card_public = p_public where id = auth.uid();
$$;

-- The public read seam. Returns a row only when the member has opted in AND has
-- a finished taste read. No auth.uid() gate — the card is meant to be shared.
create or replace function public.public_taste_card(p_username citext)
returns table (
  username citext,
  display_name text,
  outsider_number int,
  home_city text,
  taste_summary text,
  vibe_keywords jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.username,
    p.display_name,
    p.outsider_number,
    p.home_city,
    tp.taste_summary,
    coalesce(tp.quiz_answers -> 'dimensions' -> 'vibe_keywords', '[]'::jsonb)
  from public.profiles p
  join public.taste_profiles tp on tp.user_id = p.id
  where p.username = p_username
    and p.taste_card_public
    and tp.taste_summary is not null
  limit 1;
$$;
