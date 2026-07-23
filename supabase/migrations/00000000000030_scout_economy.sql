-- Scout Economy, part 1: data model + RLS + the security-definer RPC seam
-- (#80 / #106). The foundation the rest of the epic writes through.
--
-- Everything money-like here is integrity-critical, so it follows the quests
-- machine's pattern exactly: clients never write points, verdicts, or grants;
-- every mutation goes through a security-definer RPC (single transaction,
-- invariants checked). This migration lays the tables + RLS + the RPC
-- signatures; #107-#114 fill the bodies. No UI, no reward logic yet.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- points_ledger: append-only, provisional points. Balance is derived
-- (sum of confirmed deltas), never stored raw. Clients cannot write it;
-- status transitions (escrow -> confirmed -> clawed_back) happen only inside
-- the ledger RPCs (#108). The trigger makes it append-only for clients while
-- leaving those RPCs (which run as a privileged role) free to transition
-- status -- unlike moderation_actions, this table legitimately changes state,
-- but only ever via trusted server code.
-- ---------------------------------------------------------------------------

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null,
  reason text not null
    check (reason in ('spot_verified', 'confirmation', 'discovery', 'clawback')),
  ref_type text,
  ref_id uuid,
  status text not null default 'escrow'
    check (status in ('escrow', 'confirmed', 'clawed_back')),
  created_at timestamptz not null default now()
);
create index points_ledger_user_idx on public.points_ledger (user_id, created_at desc);
create index points_ledger_ref_idx on public.points_ledger (ref_type, ref_id);

alter table public.points_ledger enable row level security;

-- A member sees their own ledger; admins see all. No client insert/update/
-- delete policy => default-deny; every write is a security-definer RPC.
create policy "points_ledger: owner or admin can read"
  on public.points_ledger for select
  using (user_id = auth.uid() or public.is_admin());

-- Append-only for clients: block direct UPDATE/DELETE, but let the trusted
-- roles the ledger RPCs run as transition status.
create or replace function public.forbid_points_ledger_client_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  raise exception 'points_ledger is written only by ledger RPCs';
end;
$$;

create trigger forbid_points_ledger_client_mutation
  before update or delete on public.points_ledger
  for each row execute function public.forbid_points_ledger_client_mutation();

-- ---------------------------------------------------------------------------
-- reward_thresholds: the data-driven redemption catalog ("15 verified spots
-- -> reward"). Readable by any signed-in member; ops edit it via the service
-- role (no client write policy). #109 adds detection + grants.
-- ---------------------------------------------------------------------------

create table public.reward_thresholds (
  id text primary key,
  name text not null,
  metric text not null
    check (metric in ('verified_spots', 'confirmations', 'points')),
  threshold int not null,
  -- "grant" is a reserved word; quote it. The column stays named grant so the
  -- data-driven catalog matches the epic's shape (reward_thresholds.grant).
  "grant" jsonb not null,
  is_active boolean not null default true
);

alter table public.reward_thresholds enable row level security;

create policy "reward_thresholds: signed-in can read"
  on public.reward_thresholds for select
  using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- reward_grants: one grant per member per threshold. Written only by the
-- grant RPC (#109); a member reads their own.
-- ---------------------------------------------------------------------------

create table public.reward_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  threshold_id text not null references public.reward_thresholds(id),
  granted_at timestamptz not null default now(),
  unique (user_id, threshold_id)
);
create index reward_grants_user_idx on public.reward_grants (user_id);

alter table public.reward_grants enable row level security;

create policy "reward_grants: owner or admin can read"
  on public.reward_grants for select
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- bounty_quests: community/bounty quest metadata (verify/discover). Written
-- only by RPCs; status transitions are pinned by the trigger below. The read
-- policy here is a placeholder (any signed-in member) that #107/#114 tighten
-- to reputation-eligible, independent members.
-- ---------------------------------------------------------------------------

create table public.bounty_quests (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid references public.quests(id) on delete cascade,
  type text not null check (type in ('verify', 'discover')),
  submission_id uuid,
  area text,
  city text references public.cities(slug),
  lister_id uuid references public.profiles(id) on delete set null,
  bounty_points int not null default 0,
  quorum_needed int not null default 2,
  quorum_needed_reject int not null default 3,
  status text not null default 'open'
    check (status in ('open', 'resolving', 'published', 'rejected', 'expired')),
  created_at timestamptz not null default now()
);
create index bounty_quests_open_idx on public.bounty_quests (status, city, created_at desc);

alter table public.bounty_quests enable row level security;

-- Placeholder read policy; eligibility (reputation + independence, #107/#111)
-- is layered on in the listing surface (#114). No client write policy.
create policy "bounty_quests: signed-in can read"
  on public.bounty_quests for select
  using (auth.uid() is not null);

create or replace function public.protect_bounty_quest_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  raise exception 'bounty_quests changes only via bounty RPCs';
end;
$$;

create trigger protect_bounty_quest_columns
  before update on public.bounty_quests
  for each row execute function public.protect_bounty_quest_columns();

-- ---------------------------------------------------------------------------
-- quest_confirmations: one verdict per validator per bounty; the anti-fraud
-- evidence (server-computed geo_ok / independence_ok) lives here. Insert only
-- via the confirmation RPC (#112) so those booleans can never be client-set;
-- a validator reads their own, admins read all. Blindness (not seeing who
-- listed) is enforced in the API/query layer (#111), not here.
-- ---------------------------------------------------------------------------

create table public.quest_confirmations (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounty_quests(id) on delete cascade,
  validator_id uuid not null references public.profiles(id) on delete cascade,
  verdict text not null check (verdict in ('exists', 'not_exists')),
  quality smallint check (quality between 1 and 5),
  media jsonb,
  captured_lat double precision,
  captured_lng double precision,
  captured_at timestamptz,
  geo_ok boolean,
  independence_ok boolean,
  created_at timestamptz not null default now(),
  unique (bounty_id, validator_id)
);
create index quest_confirmations_bounty_idx on public.quest_confirmations (bounty_id);

alter table public.quest_confirmations enable row level security;

create policy "quest_confirmations: validator or admin can read"
  on public.quest_confirmations for select
  using (validator_id = auth.uid() or public.is_admin());

create or replace function public.protect_quest_confirmation_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return coalesce(new, old);
  end if;
  raise exception 'quest_confirmations are written only via the confirmation RPC';
end;
$$;

create trigger protect_quest_confirmation_columns
  before update or delete on public.quest_confirmations
  for each row execute function public.protect_quest_confirmation_columns();

-- ---------------------------------------------------------------------------
-- Security-definer RPC seam. These are the ONLY write path for points,
-- verdicts, bounties, and grants. Signatures + the security-definer/
-- search_path envelope land here; bodies are filled by later sub-issues and
-- raise until then so nothing half-built can run.
-- ---------------------------------------------------------------------------

-- #110: create a verify/discover bounty from a submission or an area gap.
create or replace function public.create_bounty(
  p_type text,
  p_submission_id uuid default null,
  p_quest_id uuid default null,
  p_area text default null,
  p_city text default null,
  p_lister_id uuid default null,
  p_bounty_points int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'create_bounty not implemented yet (lands in #110)';
end;
$$;

-- #112/#111: submit a confirmation; geo_ok/independence_ok are computed
-- server-side here, never trusted from the client.
create or replace function public.submit_confirmation(
  p_bounty_id uuid,
  p_verdict text,
  p_quality smallint default null,
  p_media jsonb default null,
  p_captured_lat double precision default null,
  p_captured_lng double precision default null,
  p_captured_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'submit_confirmation not implemented yet (lands in #112)';
end;
$$;

-- #113: aggregate verdicts for a bounty -> publish/reject + escrow payout.
create or replace function public.aggregate_verdict(p_bounty_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'aggregate_verdict not implemented yet (lands in #113)';
end;
$$;

-- #108: escrow a provisional points award.
create or replace function public.award_points_escrow(
  p_user_id uuid,
  p_delta int,
  p_reason text,
  p_ref_type text default null,
  p_ref_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'award_points_escrow not implemented yet (lands in #108)';
end;
$$;

-- #108: confirm escrowed points for a referenced quest/submission.
create or replace function public.confirm_points(
  p_ref_type text,
  p_ref_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'confirm_points not implemented yet (lands in #108)';
end;
$$;

-- #108: reverse points on audit/contradiction (+ strike via #70).
create or replace function public.clawback_points(
  p_ref_type text,
  p_ref_id uuid,
  p_reason text default 'clawback'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'clawback_points not implemented yet (lands in #108)';
end;
$$;

-- #109: grant a reward threshold to a member (idempotent per threshold).
create or replace function public.grant_threshold(
  p_user_id uuid,
  p_threshold_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'grant_threshold not implemented yet (lands in #109)';
end;
$$;
