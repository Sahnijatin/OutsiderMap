-- Instrumentation & north-star metrics (#120), part 1: the measurement layer.
--
-- No product analytics existed beyond the admin "Signals" 7-day tallies. This
-- adds the two north-star reads, the activation funnel, and D1/D7/D30 retention
-- as admin-only aggregate RPCs computed on demand (both Vercel cron slots are
-- already taken, so nothing new is scheduled — the admin page calls these live).
--
-- interaction_events is owner-read under RLS, so cross-user aggregation runs
-- through security-definer RPCs guarded by is_admin(); call them with the
-- admin's session client (auth.uid() = the admin) so the guard resolves.
--
-- Accept-rate is a PROXY this round: a "query" (answer served) counts as
-- accepted if the same member takes a positive action within a short window.
-- Precise answer_served/answer_accepted events land in a follow-up (#120 part 2).

set check_function_bodies = off;

-- Aggregates scan by type + time and by time; the only existing index is
-- (user_id, created_at). Add the two the metric queries need.
create index if not exists interaction_events_type_time_idx
  on public.interaction_events (event_type, created_at desc);
create index if not exists interaction_events_created_idx
  on public.interaction_events (created_at desc);

-- ---------------------------------------------------------------------------
-- Confident-Answer-Accept-Rate (proxy). Of the answers served (a `query`
-- event), how many were followed by a positive action from the same member
-- within p_window_minutes. Returns raw counts; the rate is asks -> accepts.
-- ---------------------------------------------------------------------------

create or replace function public.metrics_accept_rate(
  p_days int default 7,
  p_window_minutes int default 30
)
returns table (asks int, accepts int)
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
  with asks as (
    select e.id, e.user_id, e.created_at
    from public.interaction_events e
    where e.event_type = 'query'
      and e.created_at >= now() - make_interval(days => greatest(p_days, 1))
  ),
  accepted as (
    select a.id
    from asks a
    where exists (
      select 1 from public.interaction_events e
      where e.user_id = a.user_id
        and e.event_type in (
          'save','start','complete','visit','rec_click','chat_pick_click',
          'bucket_add','plan_add','quest_start')
        and e.created_at > a.created_at
        and e.created_at <= a.created_at + make_interval(mins => greatest(p_window_minutes, 1))
    )
  )
  select (select count(*) from asks)::int,
         (select count(*) from accepted)::int;
end;
$$;

-- ---------------------------------------------------------------------------
-- Daily series (IST days): asks, accepts (positive actions), active users.
-- Zero-filled across the window so the chart has no gaps.
-- ---------------------------------------------------------------------------

create or replace function public.metrics_daily(p_days int default 30)
returns table (day date, asks int, accepts int, active_users int)
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
  with span as (
    select generate_series(
      (now() at time zone 'Asia/Kolkata')::date - (greatest(p_days, 1) - 1),
      (now() at time zone 'Asia/Kolkata')::date,
      interval '1 day'
    )::date as day
  ),
  ev as (
    select ((e.created_at at time zone 'Asia/Kolkata')::date) as day,
           e.user_id, e.event_type
    from public.interaction_events e
    where e.created_at >= now() - make_interval(days => greatest(p_days, 1))
  )
  select s.day,
    count(*) filter (where ev.event_type = 'query')::int,
    count(*) filter (where ev.event_type in (
      'save','start','complete','visit','rec_click','chat_pick_click',
      'bucket_add','plan_add','quest_start'))::int,
    count(distinct ev.user_id)::int
  from span s
  left join ev on ev.day = s.day
  group by s.day
  order by s.day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activation funnel over members who signed up in the last p_days. Starts at
-- sign-up (anonymous "land" isn't in interaction_events — that arrives with the
-- #116 anon paths). Each stage is a subset of the one above.
-- ---------------------------------------------------------------------------

create or replace function public.metrics_funnel(p_days int default 30)
returns table (stage text, n int, ord int)
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
  with cohort as (
    select p.id as user_id, p.created_at, p.onboarding_completed_at
    from public.profiles p
    where p.created_at >= now() - make_interval(days => greatest(p_days, 1))
  ),
  asked as (
    select distinct c.user_id
    from cohort c
    join public.interaction_events e
      on e.user_id = c.user_id and e.event_type = 'query'
  ),
  accepted as (
    select distinct c.user_id
    from cohort c
    join public.interaction_events e
      on e.user_id = c.user_id
     and e.event_type in (
       'save','start','complete','visit','rec_click','chat_pick_click',
       'bucket_add','plan_add','quest_start')
  ),
  returned as (
    select distinct c.user_id
    from cohort c
    join public.interaction_events e on e.user_id = c.user_id
    where (e.created_at at time zone 'Asia/Kolkata')::date
        > (c.created_at at time zone 'Asia/Kolkata')::date
  )
  select * from (values
    ('signed_up',    (select count(*) from cohort)::int, 1),
    ('onboarded',    (select count(*) from cohort where onboarding_completed_at is not null)::int, 2),
    ('first_ask',    (select count(*) from asked)::int, 3),
    ('first_accept', (select count(*) from accepted)::int, 4),
    ('returned',     (select count(*) from returned)::int, 5)
  ) as t(stage, n, ord)
  order by ord;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention cohorts by sign-up week (IST). dN = members who came back on or
-- after day N — a forgiving "still returning by DN" read, labelled as such in
-- the UI. The curve that flattens is the signal.
-- ---------------------------------------------------------------------------

create or replace function public.metrics_retention(p_weeks int default 8)
returns table (
  cohort_week date,
  cohort_size int,
  d1 int,
  d7 int,
  d30 int
)
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
  with cohort as (
    select p.id as user_id,
      date_trunc('week', (p.created_at at time zone 'Asia/Kolkata'))::date as wk,
      (p.created_at at time zone 'Asia/Kolkata')::date as signup_day
    from public.profiles p
    where p.created_at >= now() - make_interval(weeks => greatest(p_weeks, 1))
  ),
  activity as (
    select distinct c.user_id, c.wk,
      ((e.created_at at time zone 'Asia/Kolkata')::date - c.signup_day) as day_offset
    from cohort c
    join public.interaction_events e on e.user_id = c.user_id
  )
  select c.wk,
    count(distinct c.user_id)::int,
    count(distinct a.user_id) filter (where a.day_offset >= 1)::int,
    count(distinct a.user_id) filter (where a.day_offset >= 7)::int,
    count(distinct a.user_id) filter (where a.day_offset >= 30)::int
  from cohort c
  left join activity a on a.user_id = c.user_id
  group by c.wk
  order by c.wk;
end;
$$;
