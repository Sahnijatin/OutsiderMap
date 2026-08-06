-- Guided tour: the six-surface first-run walkthrough.
--
-- Onboarding and the activation beat (migration 39) both end in a moment, not
-- an orientation. A member who lands on the map still has no idea that chat
-- answers in one sentence, that a quest is a route rather than a list, or that
-- blog is its own destination. The tour walks all six surfaces once,
-- spotlighting the real nav item on the real screen.
--
-- tour_completed_at mirrors activated_at exactly: one nullable timestamp the
-- member sets themselves. "profiles: owner can update" (migration 10) is
-- column-agnostic and protect_identity_columns() guards only
-- is_admin/outsider_number/username, so this needs no policy, trigger or RPC
-- work. The second BEFORE UPDATE trigger (migration 46) is scoped to
-- onboarding_completed_at and will not fire on this column either.
--
-- Skipping counts as completing: a tour you dismissed must never ask again.
-- The profile settings card is the way back in, and it deliberately does NOT
-- clear this column - the first completion is the funnel fact worth keeping.
--
-- Existing members are stamped as done, the same posture migration 39 took.
-- Nobody who already knows the app gets a walkthrough on their next open.
-- now() rather than a backdated column: this is the moment we decided they
-- were exempt, and pretending they took the tour earlier would be a lie in
-- the data.

alter table public.profiles
  add column tour_completed_at timestamptz;

update public.profiles
  set tour_completed_at = now()
  where onboarding_completed_at is not null;
