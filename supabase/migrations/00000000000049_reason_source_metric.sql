-- How often the concierge writes a real reason, and how often it falls back to
-- the shared editor note.
--
-- Every pick card carries `reasonSource`: "model" means the agent wrote that
-- sentence for that member and that ask; "editor_note" means it didn't, and the
-- member got the static blurb every other member sees. The UI is already honest
-- about it ("From our notes: ..."), which makes the editor-note share the most
-- direct read available on how often we serve generic copy - and it needs no
-- new instrumentation, because `engine.ts` has been stamping the field all
-- along.
--
-- Degraded turns are counted separately rather than folded in. When the agent
-- loop fails the turn degrades to keyword search, whose picks carry editor
-- notes by construction. Mixing those into the same number would let a provider
-- outage read as a personalization regression, which is the one misreading this
-- metric exists to prevent.
--
-- Admin-only, same posture as the other metrics RPCs (security definer +
-- is_admin guard, called with the admin's session client).

set check_function_bodies = off;

create or replace function public.metrics_reason_source(p_days int default 7)
returns table (model int, editor_note int, degraded int)
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
  -- Materialized so the planner cannot hoist jsonb_array_elements above the
  -- jsonb_typeof guard: it errors on any row whose picks column is not an array.
  with msgs as materialized (
    select m.picks, m.degraded
    from public.chat_messages m
    where m.role = 'assistant'
      and m.created_at >= now() - make_interval(days => greatest(p_days, 1))
      and jsonb_typeof(m.picks) = 'array'
  ),
  picks as (
    select p.value as pick, msgs.degraded
    from msgs
    cross join lateral jsonb_array_elements(msgs.picks) as p(value)
  )
  select
    count(*) filter (
      where not degraded and pick->>'reasonSource' = 'model'
    )::int,
    -- Anything that is not "model" is the static note, including picks
    -- persisted before the field existed - that is the field's own contract.
    count(*) filter (
      where not degraded and pick->>'reasonSource' is distinct from 'model'
    )::int,
    count(*) filter (where degraded)::int
  from picks;
end;
$$;

comment on function public.metrics_reason_source(int) is
  'Admin-only. Pick reasons in the window split into model-written vs static editor note, with degraded-turn picks counted separately.';
