import type { Register } from "@/lib/chat/language";

/**
 * The survey eval set (#100): real user phrasings from the epic, turned into
 * structured expectations. Two layers use this:
 *  - a deterministic eval (register + numeric-budget detection) that runs in CI
 *    with no model or DB;
 *  - a model-backed harness (skipped unless CHAT_EVAL_LIVE is set) that runs the
 *    real agent and checks routing + that real catalog places/plans come back.
 *
 * `route` is the intended task routing - asserted only by the live harness,
 * since routing is the model's judgment, not a deterministic function.
 */

export type EvalRoute =
  | "single_pick"
  | "multi_stop"
  | "shopping"
  | "question"
  | "sensitive";

export interface EvalScenario {
  id: number;
  text: string;
  /** Expected language register from detectRegister. */
  register: Register;
  /** A per-head rupee budget the text states, if any. */
  rupees: number | null;
  /** Intended routing (live harness only). */
  route: EvalRoute;
  /** What a good answer must do - human-readable, for the live harness/report. */
  expectation: string;
}

export const EVAL_SCENARIOS: EvalScenario[] = [
  {
    id: 1,
    text: "200 mie dinner krna hai",
    register: "hinglish",
    rupees: 200,
    route: "single_pick",
    expectation: "~₹200/head dinner picks; Hinglish read + numeric budget honoured.",
  },
  {
    id: 2,
    text: "want something fancy sweet something fancy but on a budget",
    register: "english",
    rupees: null,
    route: "single_pick",
    expectation: "Upscale-feeling dessert that's still affordable.",
  },
  {
    id: 3,
    text: "want to go shoppinggg, need these things: 1. tops 2. jeans 3. shoes/jewellery, my budget is xyz",
    register: "english",
    rupees: null,
    route: "shopping",
    expectation: "Routes to the Planner as a trackable shopping run.",
  },
  {
    id: 4,
    text: "spicy dinner followed by something sweet in a locality where i can run into street cats and dogs",
    register: "english",
    rupees: null,
    route: "multi_stop",
    expectation: "A 2-stop plan in a locality with that texture.",
  },
  {
    id: 5,
    text: "i am a bachelor and want affordable but pretty date location",
    register: "english",
    rupees: null,
    route: "single_pick",
    expectation: "Affordable, good-looking date spot.",
  },
  {
    id: 6,
    text: "I want to go on a date to resolve my dating issues",
    register: "english",
    rupees: null,
    route: "sensitive",
    expectation: "Low-pressure, forgiving, conversation-friendly; handled with care.",
  },
  {
    id: 7,
    text: "I want to go with a business partner to discuss something suggest me a place",
    register: "english",
    rupees: null,
    route: "single_pick",
    expectation: "Quiet, respectable, talk-friendly.",
  },
  {
    id: 8,
    text: "i just need quiet space prolly better if with a view",
    register: "english",
    rupees: null,
    route: "single_pick",
    expectation: "Quiet, with a view.",
  },
  {
    id: 9,
    text: "something adventurous, rooftop like",
    register: "english",
    rupees: null,
    route: "single_pick",
    expectation: "Adventurous, rooftop-ish.",
  },
];
