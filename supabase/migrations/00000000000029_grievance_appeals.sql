-- Grievance appeal / GAC leg (#70/#90): the appellate path IT Rules 2021
-- requires. A reporter may appeal a *closed* grievance (resolved/rejected)
-- within 30 days; the Grievance Appellate Committee (GAC) then upholds or
-- overturns it. The appeal state + GAC decision are recorded on the grievance
-- for compliance reporting.
--
-- grievances has no reporter-UPDATE RLS by design (reporters file + read only),
-- so the appeal transition goes through a security-definer RPC that pins the
-- move to the reporter's own row, a closed status, and the 30-day window.

set check_function_bodies = off;

alter table public.grievances
  add column appealed_at timestamptz,
  add column appeal_decision text
    check (appeal_decision in ('upheld', 'overturned')),
  add column appeal_decided_at timestamptz;

-- Reporter-driven appeal. Raises on: not found, not the reporter's grievance,
-- a grievance that isn't closed, or a lapsed 30-day window.
create or replace function public.appeal_grievance(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.grievances;
begin
  select * into g from public.grievances where id = p_id for update;
  if not found then
    raise exception 'grievance not found' using errcode = 'no_data_found';
  end if;
  if g.reporter_id is distinct from auth.uid() then
    raise exception 'not your grievance' using errcode = 'insufficient_privilege';
  end if;
  if g.status not in ('resolved', 'rejected') then
    raise exception 'only a closed grievance can be appealed'
      using errcode = 'check_violation';
  end if;
  if g.resolved_at is null or g.resolved_at < now() - interval '30 days' then
    raise exception 'the 30-day appeal window has passed'
      using errcode = 'check_violation';
  end if;
  update public.grievances
     set status = 'appealed', appealed_at = now()
   where id = p_id;
end;
$$;
