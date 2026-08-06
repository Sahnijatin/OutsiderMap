-- DPDP §9: no children, and prove it.
--
-- The Act requires verifiable parental consent for anyone under 18, and flatly
-- prohibits behavioural tracking and targeted advertising directed at children.
-- This product's core loop IS behavioural tracking: interaction_events feeds
-- learned_signals feeds every recommendation. Before this migration there was
-- nothing in the schema that could tell you whether a member was 16.
--
-- The chosen posture is the simple one: collect a date of birth, refuse
-- under-18s outright, and keep no child mode and no parental-consent
-- machinery. A product that cannot lawfully profile a child, built entirely
-- around profiling, has no honest under-18 experience to offer.
--
-- Refuse by BLOCKING, not deleting. Deleting the row lets them sign up again
-- ten seconds later with a different date, leaves us no record that we
-- refused, and with OAuth the same Google account simply recreates the
-- profile. DPDP wants a demonstrable refusal. The refusal record then ages out
-- after 30 days via the retention sweep (migration 59 + lib/account/retention),
-- so we do not keep a permanent file on a minor - that expiry is what makes
-- "block, don't delete" defensible rather than lazy.

set check_function_bodies = off;

alter table public.profiles
  -- Stored, not merely evaluated and discarded: a member who mistypes needs a
  -- correction path (§12), and "show us you age-gated" is a question that gets
  -- asked. This never leaves the server except in the member's own §11 export.
  add column date_of_birth date,
  add column age_verified_at timestamptz,
  add column blocked_at timestamptz,
  add column blocked_reason text
    check (blocked_reason in ('underage', 'abuse', 'admin'));

create index profiles_blocked_idx
  on public.profiles (blocked_reason, blocked_at)
  where blocked_at is not null;

-- ---------------------------------------------------------------------------
-- set_date_of_birth — the only write path for the gate columns
-- ---------------------------------------------------------------------------
--
-- Security definer, and the age is computed from current_date on the server.
-- A client that can post its own "isAdult: true" is not a gate.

create or replace function public.set_date_of_birth(p_dob date)
returns table (adult boolean, blocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing date;
  years int;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  -- One shot, like the username claim. Correcting a date of birth is a §12
  -- request that goes through the grievance officer, not a retry - otherwise
  -- the gate is a formality you clear on the second attempt.
  select date_of_birth into existing from public.profiles where id = uid for update;
  if existing is not null then
    raise exception 'date of birth is already recorded'
      using errcode = 'check_violation';
  end if;

  if p_dob > current_date then
    raise exception 'date of birth is in the future' using errcode = 'check_violation';
  end if;
  if p_dob < current_date - interval '120 years' then
    raise exception 'implausible date of birth' using errcode = 'check_violation';
  end if;

  years := extract(year from age(current_date, p_dob));

  if years < 18 then
    update public.profiles
       set date_of_birth = p_dob,
           blocked_at = now(),
           blocked_reason = 'underage'
     where id = uid;
    return query select false, true;
    return;
  end if;

  update public.profiles
     set date_of_birth = p_dob,
         age_verified_at = now()
   where id = uid;
  return query select true, false;
end;
$$;

-- ---------------------------------------------------------------------------
-- is_active_member — age-verified and not blocked
-- ---------------------------------------------------------------------------

create or replace function public.is_active_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select age_verified_at is not null and blocked_at is null
       from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Enforce the gate on writes, below the app
-- ---------------------------------------------------------------------------
--
-- RESTRICTIVE policies, deliberately. They AND with whatever permissive
-- policies already exist instead of replacing them, so none of the existing
-- rules are rewritten here - post_comments and post_reactions in particular
-- carry visibility and block logic (migrations 17 and 36) that would be easy
-- to subtly break by restating it.
--
-- The service role has BYPASSRLS, so cron jobs, the ingest pipeline and the
-- admin desks are unaffected.

create policy "saved_places: active members only"
  on public.saved_places as restrictive for insert
  with check (public.is_active_member());

create policy "posts: active members only"
  on public.posts as restrictive for insert
  with check (public.is_active_member());

create policy "post_comments: active members only"
  on public.post_comments as restrictive for insert
  with check (public.is_active_member());

create policy "post_reactions: active members only"
  on public.post_reactions as restrictive for insert
  with check (public.is_active_member());

create policy "quests: active members only"
  on public.quests as restrictive for insert
  with check (public.is_active_member());

create policy "chat_threads: active members only"
  on public.chat_threads as restrictive for insert
  with check (public.is_active_member());

create policy "place_claims: active members only"
  on public.place_claims as restrictive for insert
  with check (public.is_active_member());

create policy "content_reports: active members only"
  on public.content_reports as restrictive for insert
  with check (public.is_active_member());

-- The one that carries both gates.
--
-- interaction_events is the behavioural log - the thing DPDP forbids for
-- children and the thing a member withdrawing personalization consent is
-- actually asking us to stop. Enforcing it here rather than at the eight
-- insert call sites (api/interactions, api/now, api/activation,
-- api/posts/[id]/reactions, lib/chat/engine, lib/chat/tools, lib/market/report)
-- means it cannot drift: every one of those uses the member's own RLS-scoped
-- client, so the database is the right place to say no.
--
-- NOTE for whoever adds the next insert site: a blocked write surfaces as an
-- RLS error, so treat a failed interaction_events insert as expected and log
-- rather than 500. api/interactions was fixed for exactly this.
create policy "interaction_events: active members with personalization consent"
  on public.interaction_events as restrictive for insert
  with check (
    public.is_active_member() and public.personalization_granted()
  );

-- ---------------------------------------------------------------------------
-- Column-level grants: the gate columns are not client-writable
-- ---------------------------------------------------------------------------
--
-- RLS decides which ROWS you may touch; it says nothing about which COLUMNS.
-- Without this, a member client holding a valid session could PATCH its own
-- age_verified_at or clear blocked_at through PostgREST, and the whole gate
-- would be advisory.
--
-- Every member-client profiles update was audited against this list:
--   (shell)/profile/actions.ts   bio
--   setup/actions.ts             username
--   lib/taste/onboarding.ts      onboarding_completed_at
--   api/activation/route.ts      activated_at
--   lib/chat/eval/harness.ts     display_name, home_city  (dev-only harness)
-- taste_card_public is written through the set_taste_card_public RPC, not
-- directly, but is granted anyway - granting a column nobody writes costs
-- nothing, and it is legitimately the member's to set.
--
-- Deliberately NOT granted:
--   is_admin                 privilege escalation; admin desks already use the
--                            service role (admin/members/actions.ts)
--   personalization_enabled  only the consents trigger writes it now
--   date_of_birth, age_verified_at, blocked_at, blocked_reason, outsider_number,
--   curator_score, policy_version_accepted
--
-- The service role is a different role and keeps its privileges.
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

grant update (
  display_name,
  bio,
  avatar_url,
  home_area,
  home_city,
  taste_card_public,
  username,
  onboarding_completed_at,
  activated_at
) on public.profiles to authenticated;
