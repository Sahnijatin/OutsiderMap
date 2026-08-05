-- DPDP §14: the right to nominate.
--
-- A data principal may nominate someone to exercise their rights on their
-- behalf in the event of death or incapacity. There was no way to do that.
--
-- Scope, deliberately narrow: this table records a declaration, nothing more.
-- No nominee verification, no nominee login, no nominee-initiated requests.
-- The nominee acts by contacting the grievance officer, who verifies against
-- this row - and /privacy says exactly that. An unverified nominee record that
-- LOOKED like an access path would be worse than having none: it would be an
-- account takeover route wearing a compliance badge.

create table public.nominees (
  -- One nominee per member. A second one is a replacement, not an addition -
  -- which keeps "who did they nominate" a question with one answer.
  user_id uuid primary key references public.profiles(id) on delete cascade,

  name text not null check (char_length(btrim(name)) between 2 and 120),
  relationship text check (relationship is null or char_length(relationship) <= 60),

  email citext,
  phone text check (phone is null or char_length(phone) between 6 and 20),
  note text check (note is null or char_length(note) <= 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A nominee nobody can reach is not a nomination.
  constraint nominees_reachable check (email is not null or phone is not null)
);

alter table public.nominees enable row level security;

-- Unlike consents, this row is the member's own declaration about their own
-- affairs - not our evidence of an act they performed. So they own it
-- outright, including the right to change their mind.
create policy "nominees: owner full access"
  on public.nominees for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The officer has to be able to check a claim against it.
create policy "nominees: admin can read"
  on public.nominees for select
  using (public.is_admin());
