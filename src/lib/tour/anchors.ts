import type { NavHref } from "@/components/app/nav-items";

/**
 * The first anchoring convention in the app. `data-tour` marks an element the
 * guided tour can point at; nothing else reads it and it is never used for
 * styling.
 *
 * Both navs (bottom tabs on phones, side rail on lg+) are permanently in the
 * DOM with one of them display:none, so every `data-tour` value matches TWO
 * elements and a bare querySelector returns the wrong one. All lookups go
 * through resolveTourTarget() in lib/tour/target.ts.
 *
 * `satisfies Record<NavHref, ...>` is the gate: add a nav destination and tsc
 * fails here until the tour learns about it.
 */
export const NAV_TOUR_IDS = {
  "/map": "nav-map",
  "/chat": "nav-chat",
  "/quests": "nav-quests",
  "/feed": "nav-feed",
  "/blog": "nav-blog",
  "/profile": "nav-profile",
} as const satisfies Record<NavHref, `nav-${string}`>;

export type TourAnchor = (typeof NAV_TOUR_IDS)[NavHref];
