import { isAdult } from "./age";
import { needsReconsent } from "./policy";

/**
 * Which step of the front door a member is standing at.
 *
 * Pure, so the branching order can be pinned by a test rather than discovered
 * by clicking through five account states. requireOnboarded() and the /setup
 * page both read from this, which is what stops the server gate and the page
 * that renders the steps from disagreeing - a disagreement that shows up as a
 * redirect loop, in production, for the people least able to report it.
 */

export type GateProfile = {
  username: string | null;
  onboarding_completed_at: string | null;
  age_verified_at: string | null;
  blocked_at: string | null;
  date_of_birth: string | null;
  policy_version_accepted: string | null;
};

export type GateStep =
  | "blocked"
  | "age"
  | "username"
  | "quiz"
  | "reconsent"
  | "ok";

/**
 * Order matters and is deliberate:
 *
 *  1. blocked   nothing else is worth asking someone we have refused.
 *  2. age       DPDP §9 - before any profiling begins, which means before the
 *               quiz and before a username exists to attach anything to.
 *  3. username  unchanged from before.
 *  4. quiz      the first profiling step, and now the first one that only
 *               happens after an itemized consent.
 *  5. reconsent last, because it is the only one an established member hits,
 *               and bouncing a half-set-up account to a policy diff would be
 *               noise.
 */
export function evaluateGate(profile: GateProfile, nowMs: number): GateStep {
  if (profile.blocked_at) return "blocked";

  // Belt and braces: a stored date of birth that no longer clears the gate
  // means something wrote the column without going through the RPC.
  if (profile.date_of_birth && !isAdult(profile.date_of_birth, nowMs)) {
    return "blocked";
  }

  if (!profile.age_verified_at) return "age";
  if (!profile.username) return "username";
  if (!profile.onboarding_completed_at) return "quiz";
  if (needsReconsent(profile.policy_version_accepted)) return "reconsent";
  return "ok";
}
