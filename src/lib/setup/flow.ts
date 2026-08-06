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
  /**
   * `undefined` is meaningfully different from `null` or `[]` here: the column
   * is NOT NULL with a default, so a profile row selected with `*` can only be
   * missing this property when the column itself does not exist - i.e. the app
   * is running ahead of migration 57. See `schemaReady`.
   */
  setup_steps?: string[] | null;
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

/**
 * Whether the database can record progress at all.
 *
 * False only when the app is deployed ahead of migration 57: the column is
 * absent, so `select("*")` never returns the property, and `mark_setup_step`
 * does not exist either. In that state the new screens cannot be completed by
 * anyone - saving marks nothing, and skipping calls the same missing function,
 * so a member would be pinned on the identity screen with no way forward. The
 * city screen escapes on its own (home_area is its own evidence); identity
 * cannot, because handle_new_user prefills display_name and avatar_url from
 * the OAuth provider, so neither column proves the member answered.
 *
 * The honest response is to stand aside: if progress cannot be recorded, do
 * not gate anyone on recording it. The new screens simply do not appear until
 * the migration lands, and the flow behaves exactly as it did before this
 * feature existed.
 */
function schemaReady(profile: SetupProfileShape): boolean {
  return profile.setup_steps !== undefined;
}

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
  // Same reasoning for the home area: nothing but a deliberate answer ever
  // writes it (unlike home_city, which is defaulted, or display_name/avatar_url,
  // which handle_new_user prefills from the OAuth provider). Without this, a
  // marker write that failed - the RPC missing because the app shipped ahead of
  // the migration, say - would pin the member on the city screen with no exit,
  // since skipping calls the same RPC.
  if (profile.home_area) done.add("city");
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
  //
  // Resolved from COLUMN VALUES, via the same missingProfileBits the profile
  // card uses - never from the markers. The two must agree or the card becomes
  // a no-op: a skipped screen is marked done while leaving its column empty,
  // and the backfill marks `identity` for anyone whose OAuth provider supplied
  // a name, so markers say "answered" while the data says otherwise. Resolving
  // on markers here sent those members straight back to /profile with the card
  // still showing - and since these screens are the only avatar and area
  // editor in the app, that left them no way to fill the gap at all.
  //
  // `location` is deliberately unreachable this way: its state lives in the OS,
  // missingProfileBits can never report it, and the first run already asked.
  if (opts.fill) {
    const gaps = missingProfileBits(profile);
    const next = PROFILE_STEPS.find((id) => gaps.includes(id));
    return next ? step(next) : { kind: "done", to: "/profile" };
  }

  // 3. No username means the account has no identity yet, whatever else the
  //    row says. The DB makes this one-shot anyway.
  if (!profile.username) return step("username");

  // 4. The database cannot record progress yet (app deployed ahead of the
  //    migration). Skip straight to the part of the flow that predates all of
  //    this rather than gating anyone on a marker nothing can write.
  if (!schemaReady(profile)) {
    return profile.onboarding_completed_at
      ? { kind: "done", to: "/map" }
      : step("quiz");
  }

  // 5. THE GUARD. A member who has finished onboarding is done, full stop -
  //    checked before the step set is consulted, so an empty or stale
  //    setup_steps can never drag an existing member back into the flow.
  if (profile.onboarding_completed_at) return { kind: "done", to: "/map" };

  // 6. Otherwise: the first screen they have not finished. Unknown ids in the
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
  // Nothing to offer while the database cannot record the answer: the card's
  // CTA leads to screens that cannot be completed yet, so showing it would be
  // an invitation into a dead end.
  if (!schemaReady(profile)) return [];

  const missing: SetupStepId[] = [];
  if (!profile.home_area) missing.push("city");
  if (!profile.avatar_url || !profile.display_name?.trim()) {
    missing.push("identity");
  }
  return missing;
}
