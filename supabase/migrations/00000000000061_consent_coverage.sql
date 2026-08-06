-- Two holes in the consent work from migrations 57 and 58.
--
-- 1. The member_memory consent toggle did not do anything.
--
--    The profile settings card offers "Remembering what you tell it" as its
--    own switch, and withdrawing it deletes the remembered facts. But the
--    extractor in lib/chat/memory.ts gated writes on personalization_enabled,
--    so the next chat turn wrote new ones. The member was told the setting was
--    off and it was not - which is worse than never having offered it.
--
--    Fixed the same way personalization already works: a denormalized column
--    on profiles, maintained by the existing trigger, so the check stays a
--    single column read on a query the extractor already makes.
--
--    Withdrawing personalization now also withdraws member_memory. They are
--    not independent in that direction: remembered facts exist only to
--    personalize, and purgeTargets() already destroys them on a personalization
--    withdrawal. The cascade is written as its own consent_events row so the
--    log says what happened rather than leaving a state nothing explains.
--
-- 2. Five member-writable tables were left out of the age gate in 58.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- memory_enabled: the hot-path read for the member_memory purpose
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column memory_enabled boolean not null default true;

-- Project member_memory onto profiles alongside personalization. Same shape as
-- before: the consents table is the record, the column is a cache the database
-- maintains, and no application code has to remember to keep them in step.
create or replace function public.sync_consent_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purpose = 'personalization' then
    update public.profiles
       set personalization_enabled = new.granted
     where id = new.user_id;
  elsif new.purpose = 'member_memory' then
    update public.profiles
       set memory_enabled = new.granted
     where id = new.user_id;
  elsif new.purpose = 'essential' and new.granted then
    update public.profiles
       set policy_version_accepted = new.policy_version
     where id = new.user_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_consent: withdrawing personalization takes member_memory with it
-- ---------------------------------------------------------------------------

create or replace function public.record_consent(
  p_purpose text,
  p_granted boolean,
  p_policy_version text,
  p_method text default 'settings_toggle',
  p_source jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cascaded text[] := array[]::text[];
  target text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  if p_purpose = 'essential' and not p_granted then
    raise exception 'the essential purpose cannot be withdrawn - delete the account instead'
      using errcode = 'check_violation';
  end if;

  -- Withdrawing personalization implies withdrawing member_memory. Not the
  -- reverse: a member can reasonably want recommendations without a system
  -- that remembers what they said out loud.
  if p_purpose = 'personalization' and not p_granted then
    cascaded := array['member_memory'];
  end if;

  foreach target in array (array[p_purpose] || cascaded) loop
    insert into public.consent_events
      (user_id, purpose, action, policy_version, method, source)
    values (uid, target,
            case when p_granted then 'grant' else 'withdraw' end,
            p_policy_version, p_method,
            case
              when target = p_purpose then coalesce(p_source, '{}'::jsonb)
              -- Say so in the log, so a reader is never left wondering why a
              -- purpose they did not touch changed state.
              else coalesce(p_source, '{}'::jsonb)
                   || jsonb_build_object('cascaded_from', p_purpose)
            end);

    insert into public.consents as c
      (user_id, purpose, granted, policy_version, method,
       granted_at, withdrawn_at, updated_at)
    values (uid, target, p_granted, p_policy_version, p_method,
            case when p_granted then now() end,
            case when p_granted then null else now() end,
            now())
    on conflict (user_id, purpose) do update set
      granted        = excluded.granted,
      policy_version = excluded.policy_version,
      method         = excluded.method,
      granted_at     = case
                         when excluded.granted then coalesce(c.granted_at, now())
                         else c.granted_at
                       end,
      withdrawn_at   = case when excluded.granted then null else now() end,
      updated_at     = now();
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill memory_enabled from the consent rows migration 57 already wrote
-- ---------------------------------------------------------------------------

update public.profiles p
   set memory_enabled = c.granted
  from public.consents c
 where c.user_id = p.id
   and c.purpose = 'member_memory'
   and p.memory_enabled is distinct from c.granted;

-- Anyone whose personalization is already withdrawn should not have memory on.
-- Migration 57 backfilled both purposes from the same boolean, so this is
-- belt and braces rather than a correction - but a mismatch here is exactly
-- the bug this migration exists to close.
update public.profiles
   set memory_enabled = false
 where personalization_enabled = false
   and memory_enabled = true;

-- ---------------------------------------------------------------------------
-- Age gate: the five member-writable tables migration 58 missed
-- ---------------------------------------------------------------------------
--
-- Same RESTRICTIVE shape as 58, and for the same reason: they AND with the
-- existing permissive policies instead of restating rules that already work.
--
-- Deliberately still excluded:
--   grievances      a blocked member must always be able to complain about
--                   being blocked. Gating this would close the only door out.
--   taste_profiles  written through the member's client by runOnboarding during
--                   setup, before the gate could possibly be satisfied.

create policy "weekend_plans: active members only"
  on public.weekend_plans as restrictive for insert
  with check (public.is_active_member());

create policy "follows: active members only"
  on public.follows as restrictive for insert
  with check (public.is_active_member());

create policy "friendships: active members only"
  on public.friendships as restrictive for insert
  with check (public.is_active_member());

create policy "device_tokens: active members only"
  on public.device_tokens as restrictive for insert
  with check (public.is_active_member());

create policy "market_runs: active members only"
  on public.market_runs as restrictive for insert
  with check (public.is_active_member());
