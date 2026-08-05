-- DPDP §5-§6: consent is a record, not a boolean.
--
-- Today a member signs in and the quiz starts. There is no notice screen and no
-- artifact proving what they agreed to, so "we had consent" is a claim with
-- nothing behind it. The Act wants consent that is free, specific, informed,
-- unconditional, unambiguous, itemized by purpose - and provable years later.
--
-- Three layers, because two very different questions get asked of this data:
--
--   consent_events  append-only evidence. "What did they agree to, when, under
--                   which policy version, and how did they say it."
--   consents        current state, one row per (user, purpose). "Is purpose X
--                   granted right now" - one index scan.
--   profiles.*      the hot path. personalization_enabled already exists and is
--                   read on every chat turn, every /now, every quest
--                   generation; a trigger keeps it in step with consents so the
--                   six existing gate call sites do not change at all. A gate
--                   that has to be re-plumbed through six files is a gate that
--                   will drift.
--
-- A log-only design with a `distinct on` view was considered and rejected: a
-- window function per request, to answer a boolean, is the wrong trade.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- consents — current state
-- ---------------------------------------------------------------------------

create table public.consents (
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- A closed set, as text + check rather than a pg enum, matching
  -- member_memory.kind and grievances.status: adding a purpose stays a
  -- one-line migration instead of an enum dance.
  --
  -- No 'marketing' purpose: the product sends transactional email only. A
  -- notice that lists a purpose we do not actually pursue is worse than one
  -- that omits it - it reads as boilerplate, which is what DPDP consent
  -- is not allowed to be.
  purpose text not null check (purpose in (
    'essential',        -- account, auth, the map, saved places, safety
    'personalization',  -- taste profile, learned signals, interaction history
    'member_memory',    -- durable stated facts (member_memory)
    'notifications',    -- device tokens and pushes
    'location'          -- device geolocation
  )),

  granted boolean not null,

  -- The policy the member was shown when they acted. Never back-dated: if the
  -- policy changes, they are asked again, and this records which text they
  -- actually saw.
  policy_version text not null,

  method text not null check (method in (
    'signup',           -- the notice screen at /setup step 0
    'onboarding',
    'settings_toggle',  -- the consent card on /profile
    'reconsent',        -- a material policy change, re-accepted
    'api',              -- the mobile twin
    'legacy_backfill',  -- inferred from pre-DPDP state; never a real consent
    'admin'
  )),

  -- granted_at survives a withdrawal on purpose. "When did they first say yes"
  -- and "is it on now" are different questions and both get asked - the first
  -- by an auditor, the second by every request.
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),

  primary key (user_id, purpose),

  constraint consents_state_matches_timestamps check (
    (granted and granted_at is not null and withdrawn_at is null)
    or (not granted and withdrawn_at is not null)
  )
);

-- ---------------------------------------------------------------------------
-- consent_events — append-only evidence
-- ---------------------------------------------------------------------------

create table public.consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null check (purpose in (
    'essential', 'personalization', 'member_memory', 'notifications', 'location'
  )),
  action text not null check (action in ('grant', 'withdraw')),
  policy_version text not null,
  method text not null check (method in (
    'signup', 'onboarding', 'settings_toggle', 'reconsent',
    'api', 'legacy_backfill', 'admin'
  )),

  -- Evidence of the act, not identity: route, platform, coarse client.
  -- Deliberately no IP address - it would be the only IP this product stores,
  -- and collecting a new category of personal data to prove consent to collect
  -- personal data is a bad trade.
  source jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index consent_events_user_idx
  on public.consent_events (user_id, created_at desc);

alter table public.consents enable row level security;
alter table public.consent_events enable row level security;

-- Read-only to the subject, and to nobody else but an admin.
--
-- They must be able to see what they agreed to - the §11 export reads this
-- through their own client - but a record the subject can rewrite is evidence
-- of nothing. Same posture as member_memory's learned columns and
-- taste_profiles: the row is a record of what happened, not a setting.
-- There is deliberately no insert/update/delete policy for anyone. Every write
-- goes through record_consent() below.
create policy "consents: owner can read"
  on public.consents for select
  using (user_id = auth.uid());

create policy "consents: admin can read"
  on public.consents for select
  using (public.is_admin());

create policy "consent_events: owner can read"
  on public.consent_events for select
  using (user_id = auth.uid());

create policy "consent_events: admin can read"
  on public.consent_events for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles: which policy version they last accepted
-- ---------------------------------------------------------------------------

-- Lives on profiles, not read from consents, so requireOnboarded()'s
-- re-consent check costs zero extra queries - getProfile() already does
-- select("*").
alter table public.profiles
  add column policy_version_accepted text;

-- ---------------------------------------------------------------------------
-- record_consent — the only write path
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
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  -- The essential purpose is the service itself. "Withdrawing" it is account
  -- deletion, which has its own route and its own typed confirmation - letting
  -- it be toggled here would leave a member signed in to a product forbidden
  -- from running.
  if p_purpose = 'essential' and not p_granted then
    raise exception 'the essential purpose cannot be withdrawn - delete the account instead'
      using errcode = 'check_violation';
  end if;

  insert into public.consent_events
    (user_id, purpose, action, policy_version, method, source)
  values (uid, p_purpose,
          case when p_granted then 'grant' else 'withdraw' end,
          p_policy_version, p_method, coalesce(p_source, '{}'::jsonb));

  insert into public.consents as c
    (user_id, purpose, granted, policy_version, method,
     granted_at, withdrawn_at, updated_at)
  values (uid, p_purpose, p_granted, p_policy_version, p_method,
          case when p_granted then now() end,
          case when p_granted then null else now() end,
          now())
  on conflict (user_id, purpose) do update set
    granted        = excluded.granted,
    policy_version = excluded.policy_version,
    method         = excluded.method,
    -- First yes is preserved across a re-grant; only a fresh grant after a
    -- withdrawal restamps it.
    granted_at     = case
                       when excluded.granted then coalesce(c.granted_at, now())
                       else c.granted_at
                     end,
    withdrawn_at   = case when excluded.granted then null else now() end,
    updated_at     = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- The projection that keeps the existing gate call sites untouched
-- ---------------------------------------------------------------------------

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
  elsif new.purpose = 'essential' and new.granted then
    update public.profiles
       set policy_version_accepted = new.policy_version
     where id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger consents_sync_profile
  after insert or update on public.consents
  for each row execute function public.sync_consent_to_profile();

-- Read by the interaction_events insert policy (migration 58). `stable` so
-- PostgREST evaluates it once per statement rather than once per row.
create or replace function public.personalization_granted()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select granted from public.consents
      where user_id = auth.uid() and purpose = 'personalization'),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Backfill — inferred, and labelled as inferred
-- ---------------------------------------------------------------------------
--
-- Existing members consented to nothing provable, so every row below is marked
-- method = 'legacy_backfill', policy_version = 'legacy'. An inferred consent
-- that looks like a real one is the single worst thing this table could
-- contain: it would launder the absence of evidence into evidence.
--
-- These inserts fire the sync trigger, which rewrites personalization_enabled
-- with the value it already holds. Harmless and idempotent at this size.

-- essential: inferred from the account existing at all.
insert into public.consents
  (user_id, purpose, granted, policy_version, method, granted_at, updated_at)
select p.id, 'essential', true, 'legacy', 'legacy_backfill',
       coalesce(p.created_at, now()), now()
from public.profiles p
on conflict (user_id, purpose) do nothing;

-- personalization + member_memory: inferred from the existing boolean.
insert into public.consents
  (user_id, purpose, granted, policy_version, method,
   granted_at, withdrawn_at, updated_at)
select p.id, u.purpose, coalesce(p.personalization_enabled, true),
       'legacy', 'legacy_backfill',
       case when coalesce(p.personalization_enabled, true)
            then coalesce(p.created_at, now()) end,
       case when coalesce(p.personalization_enabled, true) then null else now() end,
       now()
from public.profiles p
cross join (values ('personalization'), ('member_memory')) as u(purpose)
on conflict (user_id, purpose) do nothing;

-- notifications: inferred from a live device token.
insert into public.consents
  (user_id, purpose, granted, policy_version, method, granted_at, updated_at)
select distinct d.user_id, 'notifications', true, 'legacy', 'legacy_backfill',
       now(), now()
from public.device_tokens d
on conflict (user_id, purpose) do nothing;

-- The log must not be empty for pre-existing members, and each row must say
-- what it was inferred from - so a reader can tell an inference from a consent.
insert into public.consent_events
  (user_id, purpose, action, policy_version, method, source, created_at)
select c.user_id, c.purpose,
       case when c.granted then 'grant' else 'withdraw' end,
       'legacy', 'legacy_backfill',
       jsonb_build_object('inferred_from',
         case c.purpose
           when 'essential' then 'profiles.created_at'
           when 'notifications' then 'device_tokens'
           else 'profiles.personalization_enabled'
         end),
       coalesce(c.granted_at, c.withdrawn_at, now())
from public.consents c
where c.method = 'legacy_backfill';

-- 'legacy' is not a real policy version, so needsReconsent() treats it as
-- stale and every existing member is routed through the notice screen on next
-- sign-in. That is the point of this migration, not a side effect of it.
update public.profiles
   set policy_version_accepted = 'legacy'
 where policy_version_accepted is null;

-- handle_new_user() is deliberately NOT changed. A new account gets no consent
-- rows, and absence means not granted - the gate fails closed, and nobody can
-- reach a personalized surface before /setup step 0 grants explicitly.
