-- Activation beat (#121): the once-only first-answer moment after onboarding.
--
-- When a member finishes the taste quiz we now send them to /welcome, where the
-- convergence scene plays and one confident, taste-derived answer is revealed —
-- the crafted "the app already gets me" beat. activated_at marks that the beat
-- has been served, so it fires exactly once; the /welcome route redirects an
-- already-activated member straight into the app.
--
-- Existing members are backfilled as already-activated (from their onboarding
-- timestamp) so nobody who's been using the app suddenly gets a first-run beat.

alter table public.profiles
  add column activated_at timestamptz;

update public.profiles
  set activated_at = onboarding_completed_at
  where onboarding_completed_at is not null;

-- ---------------------------------------------------------------------------
-- Activation metrics: does the first answer land, and how fast does it arrive?
-- Reads the precise answer_served/answer_accepted events (source 'activation')
-- from #120, one per member (their first activation serve). Time-to-first-
-- answer = that serve minus onboarding_completed_at. Admin-only, same posture
-- as the other metrics RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.metrics_activation(p_days int default 30)
returns table (served int, accepted int, avg_ttfa_seconds int)
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
    select distinct on (e.user_id)
      e.user_id,
      e.payload->>'answer_id' as answer_id,
      e.created_at
    from public.interaction_events e
    where e.event_type = 'answer_served'
      and e.payload->>'source' = 'activation'
      and e.payload->>'answer_id' is not null
      and e.created_at >= now() - make_interval(days => greatest(p_days, 1))
    order by e.user_id, e.created_at asc
  ),
  accepted_ids as (
    select distinct e.payload->>'answer_id' as answer_id
    from public.interaction_events e
    where e.event_type = 'answer_accepted'
      and e.payload->>'answer_id' is not null
  )
  select
    (select count(*) from served)::int,
    (select count(*) from served s
       where s.answer_id in (select answer_id from accepted_ids))::int,
    (select avg(
        extract(epoch from (s.created_at - p.onboarding_completed_at))
      )
       from served s
       join public.profiles p on p.id = s.user_id
       where p.onboarding_completed_at is not null
         and s.created_at >= p.onboarding_completed_at)::int;
end;
$$;
