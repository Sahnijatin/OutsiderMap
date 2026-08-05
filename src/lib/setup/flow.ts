import {
  PROFILE_STEPS,
  SETUP_STEPS,
  setupStepIndex,
  type SetupStep,
  type SetupStepId,
} from "@/lib/setup/steps";

/**
 * Which screen /setup should show, decided from the profile row alone.
 *
 * Pure and dependency-free on purpose. The page that uses it is a server
 * component, and the vitest harness runs in a node environment with no DOM -
 * so this is the only shape in which the flow's rules can actually be tested.
 * Every branch below has a case in tests/setup/flow.test.ts.
 */

export type SetupProfileShape = {
  username: string | null;
  onboarding_completed_at: string | null;
  setup_steps: string[] | null;
  display_name: string | null;
  avatar_url: string | null;
  home_area: string | null;
};

export type SetupResolution =
  | { kind: "step"; step: SetupStep; index: number }
  | { kind: "done"; to: "/map" | "/profile" };

export type SetupResolveOptions = {
  /** `?redo=1` - retake the quiz, from the profile page or after a failed read. */
  redo?: boolean;
  /** `?fill=1` - run only the profile screens still missing, then go back. */
  fill?: boolean;
};

function completed(profile: SetupProfileShape): Set<string> {
  // A null column (a row written before migration 57 landed, or a hand-edited
  // one) reads as "nothing done" rather than throwing.
  const done = new Set(profile.setup_steps ?? []);
  // The username column outranks its marker: it is the one step whose data is
  // unambiguous evidence that it happened. Without this, a member holding a
  // username but no marker is sent back to the username screen, where
  // claimUsername matches zero rows, reports success, refreshes, and lands on
  // the same screen again - a loop with no way out.
  if (profile.username) done.add("username");
  return done;
}

function step(id: SetupStepId): SetupResolution {
  const found = SETUP_STEPS.find((s) => s.id === id)!;
  return { kind: "step", step: found, index: setupStepIndex(id) };
}

export function resolveSetupStep(
  profile: SetupProfileShape,
  opts: SetupResolveOptions = {},
): SetupResolution {
  const done = completed(profile);

  // 1. Retaking the quiz wins over everything. This is what keeps
  //    "Retake the quiz" on the profile page and retryTasteRead's recovery
  //    redirect working - both send ?redo=1 to an already-onboarded member,
  //    who would otherwise be bounced straight back to the map by rule 3.
  if (opts.redo) return step("quiz");

  // 2. Filling gaps runs the profile screens only, and never the quiz.
  if (opts.fill) {
    const next = PROFILE_STEPS.find((id) => !done.has(id));
    return next ? step(next) : { kind: "done", to: "/profile" };
  }

  // 3. No username means the account has no identity yet, whatever else the
  //    row says. The DB makes this one-shot anyway.
  if (!profile.username) return step("username");

  // 4. THE GUARD. A member who has finished onboarding is done, full stop -
  //    checked before the step set is consulted, so an empty or stale
  //    setup_steps can never drag an existing member back into the flow.
  if (profile.onboarding_completed_at) return { kind: "done", to: "/map" };

  // 5. Otherwise: the first screen they have not finished. Unknown ids in the
  //    stored set are simply ignored here, so rolling app code back over a
  //    rolled-forward database degrades instead of breaking.
  const next = SETUP_STEPS.find((s) => !done.has(s.id));
  return next ? step(next.id) : step("quiz");
}

/**
 * What the profile page's nudge should offer to finish.
 *
 * Keyed off the actual column values, NOT the step markers - which is the
 * whole point. Skipping a screen marks it done (so the flow stops asking) but
 * writes no data, so the gap resurfaces here where it can be filled at leisure
 * instead of blocking a first run.
 *
 * `location` is never returned: OS permission state is unreadable from the
 * server, and a nudge that cannot tell when it has been satisfied is nagging.
 */
export function missingProfileBits(
  profile: SetupProfileShape,
): SetupStepId[] {
  const missing: SetupStepId[] = [];
  if (!profile.home_area) missing.push("city");
  if (!profile.avatar_url || !profile.display_name?.trim()) {
    missing.push("identity");
  }
  return missing;
}
