-- Evidence for the two claims that are otherwise unfalsifiable.
--
-- /privacy says data ages out and that deleting your account deletes your
-- data. Both were true only in the sense that nobody had checked: there was no
-- retention job at all, and the erasure route left no trace once it had
-- finished. When a member writes in eighteen months asking "you told me you
-- deleted me in March", the answer has to come from a record, not a shrug.
--
-- Both tables are admin-read only. They are operational evidence, not member
-- data - and erasure_log deliberately holds nothing but a uuid.

create table public.retention_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  -- { "interaction_events": 412, "member_memory": 7, ... }
  deleted jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  -- True when the wall-clock deadline was hit before the plan finished, so a
  -- steadily-growing backlog is visible rather than silently truncated.
  stopped_early boolean not null default false
);

create index retention_runs_ran_idx on public.retention_runs (ran_at desc);

alter table public.retention_runs enable row level security;

create policy "retention_runs: admin can read"
  on public.retention_runs for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- erasure_log
-- ---------------------------------------------------------------------------
--
-- Note the absence of a foreign key: the profile it refers to is gone by the
-- time this row is written, which is the entire point. A bare uuid is the join
-- key a future grievance actually needs and carries no other attribute about
-- the person - keeping their email here "so we can find them later" would
-- undo the erasure it exists to record.

create table public.erasure_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  erased_at timestamptz not null default now(),
  method text not null default 'self_serve'
    check (method in ('self_serve', 'admin', 'retention_underage')),
  tables_purged int not null default 0,
  errors int not null default 0
);

create index erasure_log_user_idx on public.erasure_log (user_id);

alter table public.erasure_log enable row level security;

create policy "erasure_log: admin can read"
  on public.erasure_log for select
  using (public.is_admin());
