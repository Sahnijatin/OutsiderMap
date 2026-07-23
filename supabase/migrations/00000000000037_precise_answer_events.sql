-- Instrumentation (#120), part 2a: precise answer_served / answer_accepted.
--
-- Part 1 (migration 34) reads Confident-Answer-Accept-Rate as a PROXY: a
-- `query` event counts as accepted if the same member takes any positive action
-- within a time window. That over- and under-counts (a save 20 minutes later
-- for an unrelated reason counts; a click on answer #1 can be credited to a
-- later answer #2). This adds two precise events that link an acceptance to the
-- exact answer it acted on, via a per-answer `answer_id` echoed on the click.
--
--   answer_served   — one confident answer was shown (chat picks / Right Now).
--                     payload: { answer_id, source, query?, picks?[] }
--   answer_accepted — the member acted on a served answer (clicked a pick).
--                     payload: { answer_id }, place_id = the clicked place.
--
-- The `query` events stay, so the part-1 proxy keeps working unchanged; this is
-- additive. The A/B harness that varies one-answer-vs-list and stamps a variant
-- into these payloads is part 2b, built on top.

set check_function_bodies = off;

-- Extend the append-only taxonomy (drop/re-add the CHECK, per migration 31).
alter table public.interaction_events
  drop constraint interaction_events_event_type_check;
alter table public.interaction_events
  add constraint interaction_events_event_type_check
  check (event_type in (
    'query', 'view', 'save', 'unsave', 'rate', 'visit',
    'dismiss', 'plan_add', 'rec_click',
    'start', 'complete', 'bucket_add', 'story_view', 'dwell',
    'quest_start', 'stop_complete', 'quest_complete',
    'chat_pick_click', 'reel_share', 'market_report',
    'bounty_created', 'confirmation_submitted', 'spot_published',
    'spot_rejected', 'scout_warning', 'points_clawback',
    'answer_served', 'answer_accepted'
  ));

-- ---------------------------------------------------------------------------
-- Precise Confident-Answer-Accept-Rate. Of the answers *served* in the window,
-- how many were acted on — matched by answer_id, not a time heuristic. An
-- answer counts as accepted if any answer_accepted carries its id (ids are
-- unique per served answer, so the match is exact). Admin-only, same posture as
-- the part-1 metrics RPCs (security definer + is_admin guard, session client).
-- ---------------------------------------------------------------------------

create or replace function public.metrics_answer_accept_rate(p_days int default 7)
returns table (served int, accepted int)
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
    select e.payload->>'answer_id' as answer_id
    from public.interaction_events e
    where e.event_type = 'answer_served'
      and e.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and e.payload->>'answer_id' is not null
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
      where s.answer_id in (select answer_id from accepted_ids))::int;
end;
$$;
