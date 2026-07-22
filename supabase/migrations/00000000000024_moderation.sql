-- UGC Moderation, part 1: the data model + RLS + immutable audit log (#70/#81).
--
-- The load-bearing trust/safety layer. All tables are default-deny and
-- admin/service-role only; the CSAM surface is locked tighter (designated
-- staff only, even among admins); user_blocks is blocker-scoped; grievances
-- are reporter-insert / officer-read; and the audit log is append-only by
-- construction + a trigger. No provider calls, no UI - #82-#90 build on this.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Designated CSAM staff: a separate, locked membership table (not a profiles
-- column, so profiles' owner-update policy can never self-grant it). No RLS
-- policies => default-deny for every client; only the service role writes it.
-- ---------------------------------------------------------------------------

create table public.csam_staff (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.csam_staff enable row level security;

create or replace function public.is_csam_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.csam_staff where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- moderation_cases: one case per piece of content under review.
-- ---------------------------------------------------------------------------

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in
    ('post', 'comment', 'reel', 'profile', 'submission', 'price_report')),
  target_id uuid not null,
  author_id uuid references public.profiles(id) on delete set null,
  source text not null check (source in ('pre_publish', 'report', 'rescan')),
  assessment jsonb,
  decision text not null default 'needs_review'
    check (decision in
      ('auto_approved', 'auto_rejected', 'needs_review', 'approved', 'removed', 'escalated')),
  severity smallint not null default 0,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index moderation_cases_queue_idx
  on public.moderation_cases (decision, severity desc, created_at);

alter table public.moderation_cases enable row level security;

-- Admin read; every write is service-role (the moderation desk, like reels).
create policy "moderation_cases: admin can read"
  on public.moderation_cases for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- user_trust: trust tier + enforcement state. Admin-only (a member-facing
-- view of one's own enforcement goes through a security-definer fn in #87).
-- ---------------------------------------------------------------------------

create table public.user_trust (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null default 'new'
    check (tier in ('new', 'member', 'trusted', 'restricted')),
  strike_count int not null default 0,
  muted_until timestamptz,
  banned_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_trust enable row level security;

create policy "user_trust: admin can read"
  on public.user_trust for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- user_blocks: user-level safety, blocker-scoped (readable/writable only by
-- the blocker). Independent of content review.
-- ---------------------------------------------------------------------------

create table public.user_blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked);

alter table public.user_blocks enable row level security;

create policy "user_blocks: blocker can read own"
  on public.user_blocks for select
  using (blocker = auth.uid());

create policy "user_blocks: blocker can create own"
  on public.user_blocks for insert
  with check (blocker = auth.uid());

create policy "user_blocks: blocker can remove own"
  on public.user_blocks for delete
  using (blocker = auth.uid());

-- ---------------------------------------------------------------------------
-- grievances: formal complaints with statutory SLA timestamps. The reporter
-- files and tracks their own; officers/admins read and act.
-- ---------------------------------------------------------------------------

create table public.grievances (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text,
  target_id uuid,
  category text not null,
  body text,
  status text not null default 'received'
    check (status in ('received', 'acknowledged', 'resolved', 'appealed', 'rejected')),
  received_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  officer_id uuid references public.profiles(id) on delete set null
);
create index grievances_open_idx on public.grievances (status, received_at);

alter table public.grievances enable row level security;

create policy "grievances: reporter can file"
  on public.grievances for insert
  with check (reporter_id = auth.uid());

create policy "grievances: reporter or admin can read"
  on public.grievances for select
  using (reporter_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- moderation_actions: immutable audit log. Admin read; insert service-role;
-- update/delete forbidden for everyone (append-only for compliance).
-- ---------------------------------------------------------------------------

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.moderation_cases(id) on delete set null,
  actor text not null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index moderation_actions_case_idx on public.moderation_actions (case_id, created_at);

alter table public.moderation_actions enable row level security;

create policy "moderation_actions: admin can read"
  on public.moderation_actions for select
  using (public.is_admin());

-- Append-only: block every UPDATE/DELETE, including service role, so the
-- compliance audit trail can never be rewritten in place.
create or replace function public.forbid_moderation_action_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'moderation_actions is append-only';
end;
$$;

create trigger forbid_moderation_action_mutation
  before update or delete on public.moderation_actions
  for each row execute function public.forbid_moderation_action_mutation();

-- ---------------------------------------------------------------------------
-- csam_reports: minimal, access-locked to designated CSAM staff (not general
-- admins). Evidence-preservation + reporting workflow (#85 fills it in).
-- ---------------------------------------------------------------------------

create table public.csam_reports (
  id uuid primary key default gen_random_uuid(),
  media_ref text not null,
  match_source text,
  reported_to_authority_at timestamptz,
  status text not null default 'detected'
    check (status in ('detected', 'preserved', 'reported', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.csam_reports enable row level security;

-- Locked to designated staff even among admins; every write is service-role.
create policy "csam_reports: designated staff can read"
  on public.csam_reports for select
  using (public.is_csam_staff());
