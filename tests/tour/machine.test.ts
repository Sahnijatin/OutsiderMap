import { describe, expect, it } from "vitest";
import { reconcileTour } from "@/lib/tour/machine";
import { TOUR_STEPS, TOUR_STEP_COUNT } from "@/lib/tour/steps";

/**
 * The step machine is the tour's whole behaviour, and every case here is a bug
 * that shipped or nearly shipped. The first block is the important one: an
 * earlier revision only ever navigated before the first step had painted, so
 * every Next afterwards was silently undone by a re-sync to the route the
 * member was already on - the tour sat on step 1 of 6 forever while looking
 * like it was working.
 */

const MAP = TOUR_STEPS[0].route;
const CHAT = TOUR_STEPS[1].route;
const QUESTS = TOUR_STEPS[2].route;
const BLOG = TOUR_STEPS[4].route;
const PROFILE = TOUR_STEPS[5].route;

describe("reconcileTour - advancing", () => {
  it("drives to the next step's route when the step moved and the pathname did not", () => {
    expect(
      reconcileTour({
        step: 1,
        pathname: MAP,
        lastPathname: MAP,
        expected: null,
        hasShown: true,
      }),
    ).toEqual({ type: "navigate", route: CHAT });
  });

  it("advances from every step, not just the first", () => {
    for (let step = 1; step < TOUR_STEP_COUNT; step += 1) {
      const previous = TOUR_STEPS[step - 1].route;
      expect(
        reconcileTour({
          step,
          pathname: previous,
          lastPathname: previous,
          expected: null,
          hasShown: true,
        }),
        `step ${step} must navigate away from ${previous}`,
      ).toEqual({ type: "navigate", route: TOUR_STEPS[step].route });
    }
  });

  it("shows the step once its route is reached", () => {
    expect(
      reconcileTour({
        step: 1,
        pathname: CHAT,
        lastPathname: MAP,
        expected: CHAT,
        hasShown: true,
      }),
    ).toEqual({ type: "show" });
  });

  it("waits instead of pushing twice while its own navigation is in flight", () => {
    expect(
      reconcileTour({
        step: 1,
        pathname: MAP,
        lastPathname: MAP,
        expected: CHAT,
        hasShown: true,
      }),
    ).toEqual({ type: "wait" });
  });

  it("stops waiting once the pathname moves, even if it moved somewhere else", () => {
    // The push resolved to a redirect. That is a member-visible navigation like
    // any other and must not leave the tour parked on `wait` forever.
    expect(
      reconcileTour({
        step: 1,
        pathname: "/sign-in",
        lastPathname: MAP,
        expected: CHAT,
        hasShown: true,
      }),
    ).toEqual({ type: "abandon" });
  });

  it("goes back as readily as forward", () => {
    expect(
      reconcileTour({
        step: 0,
        pathname: CHAT,
        lastPathname: CHAT,
        expected: null,
        hasShown: true,
      }),
    ).toEqual({ type: "navigate", route: MAP });
  });
});

describe("reconcileTour - following the member", () => {
  it("follows them to another tour surface rather than dragging them back", () => {
    expect(
      reconcileTour({
        step: 1,
        pathname: BLOG,
        lastPathname: CHAT,
        expected: null,
        hasShown: true,
      }),
    ).toEqual({ type: "sync", step: 4 });
  });

  it("ends the tour when they leave its surfaces entirely", () => {
    expect(
      reconcileTour({
        step: 1,
        pathname: "/places/some-bar",
        lastPathname: CHAT,
        expected: null,
        hasShown: true,
      }),
    ).toEqual({ type: "abandon" });
  });

  it("treats a sub-route as leaving - /profile/settings is not step 6", () => {
    expect(
      reconcileTour({
        step: 5,
        pathname: `${PROFILE}/edit`,
        lastPathname: PROFILE,
        expected: null,
        hasShown: true,
      }),
    ).toEqual({ type: "abandon" });
  });
});

describe("reconcileTour - launching", () => {
  it("drives to step 1 from wherever the replay button was pressed", () => {
    // /profile is itself a tour surface (the last one). Re-syncing here would
    // start the replay on step 6, which is the opposite of a walkthrough.
    expect(
      reconcileTour({
        step: 0,
        pathname: PROFILE,
        lastPathname: null,
        expected: null,
        hasShown: false,
      }),
    ).toEqual({ type: "navigate", route: MAP });
  });

  it("does not abandon before anything has painted", () => {
    expect(
      reconcileTour({
        step: 0,
        pathname: "/welcome",
        lastPathname: "/welcome",
        expected: null,
        hasShown: false,
      }),
    ).toEqual({ type: "navigate", route: MAP });
  });

  it("finishes when the step index is out of range", () => {
    expect(
      reconcileTour({
        step: TOUR_STEP_COUNT,
        pathname: MAP,
        lastPathname: MAP,
        expected: null,
        hasShown: true,
      }),
    ).toEqual({ type: "finish" });
  });
});

describe("reconcileTour - a full walk never stalls", () => {
  it("reaches the last step by pressing Next alone", () => {
    // The whole tour, driven exactly as the panel drives it: bump the step,
    // reconcile, apply, repeat. Each step must cost one navigate and one show.
    let step = 0;
    let pathname: string = MAP;
    let lastPathname: string | null = null;
    let expected: string | null = null;
    let hasShown = false;
    const painted: number[] = [];

    for (let guard = 0; guard < 50 && painted.length < TOUR_STEP_COUNT; guard += 1) {
      const action = reconcileTour({
        step,
        pathname,
        lastPathname,
        expected,
        hasShown,
      });
      lastPathname = pathname;

      if (action.type === "show") {
        hasShown = true;
        expected = null;
        painted.push(step);
        step += 1; // the member presses Next
        continue;
      }
      if (action.type === "navigate") {
        expected = action.route;
        pathname = action.route; // the router lands
        continue;
      }
      if (action.type === "finish") break;
      throw new Error(`unexpected ${action.type} during a plain Next walk`);
    }

    expect(painted).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("recovers to the right step after the member jumps mid-tour", () => {
    // Tapping /quests from step 2: the click handler sets the step and the
    // <Link> navigates, so both inputs move. The tour must settle on quests.
    const afterJump = reconcileTour({
      step: 2,
      pathname: QUESTS,
      lastPathname: CHAT,
      expected: null,
      hasShown: true,
    });
    expect(afterJump).toEqual({ type: "show" });
  });
});
