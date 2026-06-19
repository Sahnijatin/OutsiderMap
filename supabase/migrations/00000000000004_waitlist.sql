-- Phase 7: public waitlist (campaign landing page at /join).
--
-- Anonymous visitors arriving from marketing campaigns register here. An
-- optional "dropped spot" is written to public.places (source='submitted',
-- is_published=false) and surfaces in the existing admin review queue.
--
-- All writes happen via the service role inside trusted server actions, so the
-- only RLS policy required is admin read for the curation-desk view. Everything
-- else is denied by default.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text not null,
  gender text,
  city text not null,
  instagram text,
  -- The applicant's own shareable code, and the code they applied with.
  referral_code text not null unique,
  referred_by text,
  -- Set when the applicant also dropped a spot during signup.
  spot_place_id uuid references public.places(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index waitlist_created_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;

-- Admins read the queue in the curation desk; the service role (used by the
-- /join server action) bypasses RLS for writes. No public policies => default
-- deny for anon/authenticated reads.
create policy "waitlist: admin can read"
  on public.waitlist for select
  using (public.is_admin());
