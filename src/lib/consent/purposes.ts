/**
 * The itemized purposes a member consents to, and what withdrawing each one
 * actually destroys.
 *
 * DPDP §6 requires consent to be specific, informed and itemized by purpose,
 * and §6(6) requires withdrawal to be as easy as giving. One blanket checkbox
 * satisfies neither. This module is the single place that says what the
 * purposes are - the notice screen, the consent card, the privacy page and the
 * export bundle all render from it, so the text a member agrees to and the
 * text we show later cannot drift.
 */

import type { ConsentPurpose } from "@/types/database";

export type { ConsentPurpose } from "@/types/database";

export type PurposeSpec = {
  purpose: ConsentPurpose;
  label: string;
  /** Notice text. Written to be read, not to be legally survivable. */
  description: string;
  /** Required purposes cannot be refused without refusing the product. */
  required: boolean;
  /**
   * What is deleted when this is withdrawn. Rendered verbatim in the
   * confirmation, so a member sees the cost before they pay it.
   */
  dataTouched: string[];
};

export const PURPOSES: readonly PurposeSpec[] = [
  {
    purpose: "essential",
    label: "Running your account",
    description:
      "Your email, profile and the things you explicitly save. This is the " +
      "product itself - signing in, the map, saved places, and keeping " +
      "members safe from abuse. You cannot switch this off and still have an " +
      "account; deleting the account is how you withdraw it.",
    required: true,
    dataTouched: [],
  },
  {
    purpose: "personalization",
    label: "Personalized recommendations",
    description:
      "Your quiz answers and what you do in the app - places you view, save, " +
      "visit and skip - used to work out what to show you. This is what makes " +
      "the answers yours rather than a generic list.",
    required: false,
    dataTouched: [
      "what the app has learned about your taste",
      "your interaction history",
      "the facts the concierge remembers about you",
    ],
  },
  {
    purpose: "member_memory",
    label: "Remembering what you tell it",
    description:
      "Durable facts you state in chat - vegetarian, hates rooftops, always " +
      "with my partner - so you do not have to say them twice. Only things " +
      "you actually said; nothing the app inferred on its own.",
    required: false,
    dataTouched: ["the facts the concierge remembers about you"],
  },
  {
    purpose: "notifications",
    label: "Push notifications",
    description:
      "The token your device gives us, so we can send the notifications you " +
      "asked for. Signing out releases it.",
    required: false,
    dataTouched: ["your device push tokens"],
  },
  {
    purpose: "location",
    label: "Using your location",
    description:
      "Centring the map on you, finding places nearby, and verifying spots " +
      "you scout on-site. We store the area, not your exact coordinates. You " +
      "can revoke the device permission at any time.",
    required: false,
    dataTouched: [],
  },
];

export const PURPOSE_BY_KEY: Readonly<Record<ConsentPurpose, PurposeSpec>> =
  Object.fromEntries(PURPOSES.map((p) => [p.purpose, p])) as Record<
    ConsentPurpose,
    PurposeSpec
  >;

/** Everything a member may independently refuse at signup or turn off later. */
export function withdrawablePurposes(): PurposeSpec[] {
  return PURPOSES.filter((p) => !p.required);
}

/** Current state, keyed by purpose. Built from the `consents` table. */
export type ConsentMap = Partial<Record<ConsentPurpose, boolean>>;

/**
 * Fails closed: a purpose with no row is not granted.
 *
 * This is what makes the migration-57 backfill safe to be incomplete and what
 * makes a brand-new account non-personalized until it explicitly opts in.
 */
export function isGranted(map: ConsentMap, purpose: ConsentPurpose): boolean {
  return map[purpose] === true;
}

/** Derived data destroyed when a purpose is withdrawn. */
export type PurgeTarget =
  | "taste_derived"
  | "member_memory"
  | "interaction_events";

/**
 * Withdrawing personalization takes member_memory with it: remembered facts
 * are only ever used to personalize, so keeping them after the member has said
 * "stop personalizing" would be a distinction without a difference.
 */
export function purgeTargets(purpose: ConsentPurpose): PurgeTarget[] {
  switch (purpose) {
    case "personalization":
      return ["taste_derived", "member_memory", "interaction_events"];
    case "member_memory":
      return ["member_memory"];
    default:
      return [];
  }
}
