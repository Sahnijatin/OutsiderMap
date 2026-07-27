-- Scout economy bootstrap: break the validator deadlock.
--
-- can_validate() (migration 0031) gates on curator_score >= 3, and
-- curator_score is minted only when a bounty resolves - which itself needs
-- validators. Day one, nobody can validate, ever, and every bounty falls to
-- the admin fallback. Two levers fix the cold start:
--
--   1. GENESIS GRANT: the first 200 members to complete onboarding start at
--      curator_score 3, so early quorums can actually form. Self-disables at
--      scale - past 200 onboarded profiles the trigger stops granting and new
--      members earn validation rights through bounty resolution like everyone
--      else. Existing onboarded profiles are backfilled the same grant (the
--      user base is tiny, well under the window).
--
--   2. ADMIN MINT: admin_grant_validator(target) lets the desk hand-mint a
--      validator after the genesis window closes - same guard style as
--      admin_resolve_bounty (migration 0032).
--
-- greatest() everywhere: a grant never lowers a score someone already earned.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Genesis grant: BEFORE UPDATE trigger on profiles. Fires only on the
-- null -> non-null transition of onboarding_completed_at, i.e. the moment
-- onboarding completes (src/lib/taste/onboarding.ts). The count is of
-- *other* already-onboarded profiles (the row being updated is not yet
-- visible as onboarded inside a BEFORE trigger), so the window admits
-- roughly the first 200 members.
-- ---------------------------------------------------------------------------

create or replace function public.grant_genesis_validator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cold-start bootstrap; self-disables at scale (see header comment).
  if new.onboarding_completed_at is not null
     and old.onboarding_completed_at is null
     and new.curator_score < 3
     and (select count(*)
            from public.profiles
           where onboarding_completed_at is not null) <= 200 then
    new.curator_score := greatest(new.curator_score, 3);
  end if;
  return new;
end;
$$;

create trigger genesis_validator_grant
  before update of onboarding_completed_at on public.profiles
  for each row
  execute function public.grant_genesis_validator();

-- Backfill: everyone already onboarded gets the same genesis grant. The
-- current user base is far inside the 200-member window.
update public.profiles
   set curator_score = greatest(curator_score, 3)
 where onboarding_completed_at is not null
   and curator_score < 3;

-- ---------------------------------------------------------------------------
-- admin_grant_validator: hand-mint a validator after the genesis window.
-- Guarded by is_admin(), mirroring admin_resolve_bounty; call it with the
-- admin's session client so auth.uid() resolves.
-- ---------------------------------------------------------------------------

create or replace function public.admin_grant_validator(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.profiles
     set curator_score = greatest(curator_score, 3)
   where id = target;
  if not found then
    raise exception 'profile not found';
  end if;
end;
$$;
