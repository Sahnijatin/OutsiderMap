-- Instrumentation (#120), part 2b: the feature-flag / A-B experiment harness.
--
-- Part 2a made answer_served/answer_accepted precise (joined by answer_id).
-- This adds the harness that varies a behavior and reads the result: an
-- admin-managed `experiments` table, a security-definer read for the serve
-- path, and a per-variant metrics RPC. The load-bearing experiment ships
-- seeded but DISABLED — `one_answer_vs_list`: does showing one answer beat a
-- list of three? When enabled, each member is assigned a stable variant; the
-- variant is stamped into the answer_served payload, so accept-rate can be read
-- per variant off the exact 2a events.
--
-- Assignment itself is deterministic in app code (a pure hash of key+user), so
-- there is no assignment table to maintain and a user's variant is stable
-- across sessions without a write on the serve path.

set check_function_bodies = off;

create table public.experiments (
  key text primary key check (key ~ '^[a-z0-9_]{1,60}$'),
  description text,
  -- ordered variant labels, e.g. {list,one}; app-side hashing picks one.
  variants text[] not null check (array_length(variants, 1) >= 2),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.experiments enable row level security;

-- Only admins touch the table directly (config + the enabled toggle). The serve
-- path reads enabled experiments through the security-definer RPC below, so it
-- never needs table access or the admin client.
create policy "experiments: admin can manage"
  on public.experiments for all
  using (public.is_admin())
  with check (public.is_admin());

-- Enabled experiments, readable by any signed-in member so the serve path can
-- assign a variant. Exposes only non-sensitive config (key + variants).
create or replace function public.active_experiments()
returns table (key text, variants text[])
language sql
security definer
set search_path = public
stable
as $$
  select e.key, e.variants
  from public.experiments e
  where e.enabled = true
    and auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Per-variant accept-rate for one experiment, off the precise 2a events. A
-- served answer belongs to a variant via payload->>'variant'; it's accepted if
-- its answer_id shows up in an answer_accepted (ids are unique per answer, so
-- the match is exact). Admin-only, same posture as the other metrics RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.metrics_experiment(
  p_key text,
  p_days int default 14
)
returns table (variant text, served int, accepted int)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  with served as (
    select e.payload->>'variant' as variant,
           e.payload->>'answer_id' as answer_id
    from public.interaction_events e
    where e.event_type = 'answer_served'
      and e.payload->>'experiment' = p_key
      and e.payload->>'variant' is not null
      and e.payload->>'answer_id' is not null
      and e.created_at >= now() - make_interval(days => greatest(p_days, 1))
  ),
  accepted_ids as (
    select distinct e.payload->>'answer_id' as answer_id
    from public.interaction_events e
    where e.event_type = 'answer_accepted'
      and e.payload->>'answer_id' is not null
  )
  select s.variant,
         count(*)::int,
         count(*) filter (
           where s.answer_id in (select answer_id from accepted_ids)
         )::int
  from served s
  group by s.variant
  order by s.variant;
end;
$$;

-- Seed the load-bearing experiment, disabled. Enable from the admin metrics
-- page (or an UPDATE) when ready to run it.
insert into public.experiments (key, description, variants, enabled) values
  ('one_answer_vs_list',
   'Does one confident answer beat a list of three? variant "one" shows 1 pick, "list" shows 3.',
   array['list', 'one'],
   false)
on conflict (key) do nothing;
