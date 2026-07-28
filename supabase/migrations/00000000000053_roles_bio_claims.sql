-- Three member-facing gaps in one coherent pass:
--
-- 1. Admin roles were DB-surgery-only: is_admin existed but nothing could
--    flip it. The members console gains grant/revoke (app-side guards keep
--    an admin from locking themselves out).
-- 2. Profiles get a bio - the one identity field the Instagram-shaped
--    profile page was missing. public_profile() is recreated to carry it
--    (return-shape change requires drop + create).
-- 3. Businesses get a claim path: an owner claims their existing place, an
--    admin verifies, and the place carries claimed_by - the foundation the
--    owner-management surface builds on. The public place page stays THE
--    page for a business; a claim marks it owner-verified rather than
--    forking a second page.

alter table public.profiles
  add column if not exists bio text;

alter table public.places
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null;

create table public.place_claims (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Their pitch: who they are to this place, and how the desk can verify.
  note text not null,
  contact text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id)
);

create index place_claims_status_idx on public.place_claims (status, created_at);
create index place_claims_user_idx on public.place_claims (user_id);

alter table public.place_claims enable row level security;

-- Members file and watch their own claims; the desk decides.
create policy "place_claims: own insert" on public.place_claims
  for insert with check (user_id = auth.uid());
create policy "place_claims: own read" on public.place_claims
  for select using (user_id = auth.uid() or public.is_admin());
create policy "place_claims: admin write" on public.place_claims
  for update using (public.is_admin()) with check (public.is_admin());

-- public_profile now carries bio (drop first: the return shape changes).
drop function if exists public.public_profile(citext);

create function public.public_profile(candidate citext)
returns table (
  id uuid,
  username citext,
  display_name text,
  avatar_url text,
  outsider_number int,
  bio text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.outsider_number, p.bio
  from public.profiles p
  where auth.uid() is not null
    and p.username = candidate
  limit 1;
$$;
