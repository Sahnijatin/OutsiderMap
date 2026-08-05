import { QUIZ } from "@/lib/taste/quiz";

/**
 * The first-run flow, as data.
 *
 * /setup used to be two screens chosen by a boolean (`profile.username ? quiz
 * : username`). It is now a five-step flow - and because the quiz owns eight
 * screens of its own, twelve screens end to end. Describing it here rather
 * than in the page keeps the order, the copy and the pro tips in one place
 * that a test can read.
 *
 * Deliberately isomorphic - no `server-only` import - because the resolver
 * runs on the server (src/app/setup/page.tsx) and the progress bar runs on the
 * client. Same discipline as `src/lib/taste/quiz.ts`.
 */

export type SetupStepId =
  | "username"
  | "city"
  | "identity"
  | "location"
  | "quiz";

export type SetupStep = {
  id: SetupStepId;
  /**
   * Lowercase in source: `.voice` uppercases it in CSS (globals.css), and
   * writing it uppercase here would double-shout in a screen reader.
   */
  eyebrow: string;
  title: string;
  lead?: string;
  /**
   * The pro tip. Required, not optional - a screen without one is a screen
   * that teaches nothing, and the whole point of this flow is that every
   * screen earns its tap.
   */
  tip: string;
};

/**
 * Flow order. Location sits fourth rather than second on purpose: an OS
 * permission prompt before the member has given us anything reads as a
 * shakedown. By the time they reach it they have handed over an area, a name
 * and a face, so "let the map find you" continues a conversation instead of
 * opening one.
 *
 * The quiz stays last, which is what lets `completeSetup` keep its
 * `redirect("/welcome")` and lets /welcome's gates stay exactly as they were.
 */
export const SETUP_STEPS: SetupStep[] = [
  {
    id: "username",
    eyebrow: "01 / name",
    title: "That number is yours. Forever.",
    tip: "Short beats clever. This is how members find you in chat and on the map, and it's the one thing here you can't take back.",
  },
  {
    id: "city",
    eyebrow: "02 / where",
    title: "Where do you actually live?",
    lead: "The map measures everything from here - what's close, what's worth the drive, what's a Tuesday and what's a weekend.",
    tip: "Name the area you leave from, not the one you post about. Everything the map measures - what's close, what's worth the drive - starts here.",
  },
  {
    id: "identity",
    eyebrow: "03 / face",
    title: "How should the city know you?",
    lead: "This rides along on everything you leave behind - posts, recommendations, your taste card.",
    tip: "A real face gets more replies than a logo. This rides along on your posts, your card, and every recommendation you leave behind.",
  },
  {
    id: "location",
    eyebrow: "04 / signal",
    title: "Let the map find you.",
    lead: "Only while the app is open. Never in the background.",
    tip: "This is what makes \"near me\" mean anything at 2am. We read it only while the app is open, and your posts share the area, not the pin.",
  },
  {
    id: "quiz",
    eyebrow: "05 / taste",
    title: "Eight questions. Two minutes.",
    tip: "Answer fast and answer honestly. The read is better when you don't perform for it.",
  },
];

/**
 * The steps that capture profile data, in flow order. These are what
 * `/setup?fill=1` runs and what the profile page's "finish your profile" card
 * points at - the username is one-shot and the quiz has its own retake path,
 * so neither belongs here.
 */
export const PROFILE_STEPS: SetupStepId[] = ["city", "identity", "location"];

/** Total screens end to end: four static ones, plus the quiz's own eight. */
export const TOTAL_SETUP_SCREENS = SETUP_STEPS.length - 1 + QUIZ.length;

export function setupStep(id: SetupStepId): SetupStep {
  const step = SETUP_STEPS.find((s) => s.id === id);
  // Unreachable via SetupStepId, but a thrown error beats a silent undefined
  // if someone ever widens the type without adding the entry.
  if (!step) throw new Error(`unknown setup step: ${id}`);
  return step;
}

/**
 * The 0-based screen index a step starts at, for the progress bar. The quiz
 * adds its own question offset on top.
 */
export function setupStepIndex(id: SetupStepId): number {
  return SETUP_STEPS.findIndex((s) => s.id === id);
}
