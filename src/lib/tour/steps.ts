import type { NavHref } from "@/components/app/nav-items";
import { NAV_TOUR_IDS, type TourAnchor } from "@/lib/tour/anchors";
import type { Side } from "@/lib/tour/geometry";

/**
 * The guided tour's step spec. Copy lives here as data so the order and the
 * words are editable in one place, and so a test can assert the invariants
 * (six steps, unique ids, every anchor agreeing with its route).
 *
 * The order deliberately matches NAV_ITEMS: the spotlight sweeps the nav in one
 * direction instead of jumping back and forth across it.
 */

export type TourStepId =
  | "map"
  | "chat"
  | "quests"
  | "feed"
  | "blog"
  | "profile";

export type TourStep = {
  /** Stable id: also the analytics name. */
  id: TourStepId;
  /** The route this step is viewed on. The host owns getting there. */
  route: NavHref;
  /** data-tour value of the element to spotlight. */
  target: TourAnchor;
  /** The Fraunces-italic payoff line, and the dialog's accessible name. */
  title: string;
  /** One or two plain sentences, and the dialog's description. */
  body: string;
  /** Placement hint; the placer overrides it when it will not fit. */
  prefer?: Side;
};

// The annotation matters as much as the `satisfies`: without it the literal
// types drop optional keys entirely and `step.prefer` stops existing.
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "map",
    route: "/map",
    target: NAV_TOUR_IDS["/map"],
    title: "Ten thousand lights. One answer.",
    body: "Every dot is a place someone actually went to and vouched for. Tap one and the city opens. You always land here.",
  },
  {
    id: "chat",
    route: "/chat",
    target: NAV_TOUR_IDS["/chat"],
    title: "Ask at 3am. Mean it.",
    body: "Say where you are and what mood you're in, in your own words. You get one confident answer, not ten thousand options.",
  },
  {
    id: "quests",
    route: "/quests",
    target: NAV_TOUR_IDS["/quests"],
    title: "Your city, as a quest line.",
    body: "A night planned as a route, not a list. Stops in an order that makes sense, unlocking as you go.",
  },
  {
    id: "feed",
    route: "/feed",
    target: NAV_TOUR_IDS["/feed"],
    title: "What the city is doing tonight.",
    body: "Finds, notes and captures from other outsiders. The room, not the algorithm.",
  },
  {
    id: "blog",
    route: "/blog",
    target: NAV_TOUR_IDS["/blog"],
    title: "The long version.",
    body: "When a place deserves more than a caption, write it here. It shows up under the place itself.",
  },
  {
    id: "profile",
    route: "/profile",
    target: NAV_TOUR_IDS["/profile"],
    title: "Your read, kept honest.",
    body: "What we think you like, what you've saved, and every switch that controls it. This tour lives here too.",
  },
] as const satisfies readonly TourStep[];

export const TOUR_STEP_COUNT = TOUR_STEPS.length;

/** Routes the tour is allowed to paint on. Guards against stale state. */
export const TOUR_ROUTES: ReadonlySet<string> = new Set(
  TOUR_STEPS.map((step) => step.route),
);

/** anchor -> step index, for click-through re-sync when a member self-navigates. */
export const STEP_BY_ANCHOR: ReadonlyMap<string, number> = new Map(
  TOUR_STEPS.map((step, index) => [step.target, index]),
);

/**
 * Bump to re-offer the tour after a surface redesign. Also the sessionStorage
 * payload version, so a stale in-flight tour from an older build is discarded
 * rather than resumed against steps that no longer exist.
 */
export const TOUR_VERSION = 1;
