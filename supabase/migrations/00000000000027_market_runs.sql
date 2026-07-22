-- Market Intelligence, part 2: market runs (#68).
--
-- A "market run" is the Planner's shopping mode - the sibling of a day-plan
-- quest. It sits BESIDE quests (not a quests.kind flag) so the day-plan schema
-- stays clean: a run optionally links to a quest (the trackable stop-runner)
-- and carries the shopping-specific fields - target market, per-head budget,
-- the requested items, and a snapshot of the generated game-plan.
--
-- The plan snapshot holds only AGGREGATES (honest bands + guidance from
-- src/lib/market/intelligence.ts), never raw price_points rows. Owner-scoped
-- like quests; the service role bypasses RLS for server-side generation.

create table public.market_runs (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid references public.quests(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  city text not null references public.cities(slug),
  budget_max int,                              -- per-head rupee budget, nullable
  items jsonb not null default '[]'::jsonb,    -- [{ category, item?, qty? }]
  plan jsonb not null default '{}'::jsonb,     -- generated game-plan snapshot
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'abandoned')),
  created_at timestamptz not null default now()
);

create index market_runs_user_idx on public.market_runs (user_id, created_at desc);

alter table public.market_runs enable row level security;

create policy "market_runs: owner can read"
  on public.market_runs for select
  using (user_id = auth.uid());

create policy "market_runs: owner can insert own"
  on public.market_runs for insert
  with check (user_id = auth.uid());

create policy "market_runs: owner can update own"
  on public.market_runs for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "market_runs: owner can delete unfinished"
  on public.market_runs for delete
  using (user_id = auth.uid() and status in ('draft', 'abandoned'));
