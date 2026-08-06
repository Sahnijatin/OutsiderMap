import { ROUTE_TO_STEP, TOUR_STEPS } from "@/lib/tour/steps";

/**
 * The tour's step machine, as a pure function.
 *
 * This is the one piece of the tour where a mistake is invisible in review and
 * total in practice, so it lives outside React where the node-env vitest can
 * actually cover it. The host (components/tour/tour-host.tsx) does nothing but
 * feed it refs and execute what it returns.
 *
 * The hard problem it exists to solve: a step change and a member-driven
 * navigation are indistinguishable from `pathname` alone. Both leave the host
 * on a route that isn't the current step's route. Guess wrong in one direction
 * and the tour drags the member back; guess wrong in the other and every Next
 * is silently undone by a re-sync to wherever they are standing.
 *
 * The discriminator is which input moved since the last reconcile:
 *
 *   step moved, pathname didn't  -> we advanced. Drive to the step's route.
 *   pathname moved               -> they navigated. Follow, or end the tour.
 *
 * That is why `lastPathname` is threaded through rather than derived: without
 * it there is no honest way to tell the two apart.
 */

export type TourAction =
  /** On the step's route: resolve the target and paint. */
  | { type: "show" }
  /** Step changed under us; take the member to where it lives. */
  | { type: "navigate"; route: string }
  /** Our own push hasn't landed yet. Do nothing - pushing again would stack
   *  history entries and fight the router. */
  | { type: "wait" }
  /** They walked to another tour surface. Follow them there. */
  | { type: "sync"; step: number }
  /** They left the tour's surfaces. That's a dismissal. */
  | { type: "abandon" }
  /** Step index out of range - a resumed payload from another build. */
  | { type: "finish" };

export type TourMachineInput = {
  /** Index into TOUR_STEPS. */
  step: number;
  /** Route the host is on right now. */
  pathname: string;
  /** Route at the previous reconcile; null on the first one of a tour. */
  lastPathname: string | null;
  /** Route the host pushed to and is still waiting on, or null. */
  expected: string | null;
  /** Whether any step has painted yet this tour. */
  hasShown: boolean;
};

export function reconcileTour({
  step,
  pathname,
  lastPathname,
  expected,
  hasShown,
}: TourMachineInput): TourAction {
  // TOUR_STEPS[i] types as TourStep even out of range (no
  // noUncheckedIndexedAccess), so this guard is hand-written on purpose.
  const current = TOUR_STEPS[step];
  if (!current) return { type: "finish" };

  if (pathname === current.route) return { type: "show" };

  const moved = lastPathname !== null && lastPathname !== pathname;

  // A push we made is still in flight. Once the pathname moves the push has
  // resolved - to this route (handled above) or somewhere else entirely, which
  // is a member-driven navigation like any other.
  if (!moved && expected === current.route) return { type: "wait" };

  if (moved && hasShown) {
    const followed = ROUTE_TO_STEP.get(pathname);
    return followed === undefined
      ? { type: "abandon" }
      : { type: "sync", step: followed };
  }

  // Nothing has painted yet: this is a launch from elsewhere (the replay button
  // on /profile), so drive to the step rather than re-syncing to wherever they
  // happen to be standing - which for /profile would silently start the tour on
  // its last step.
  return { type: "navigate", route: current.route };
}
