import { describe, expect, it } from "vitest";
import { EVAL_SCENARIOS } from "@/lib/chat/eval/scenarios";
import { EVAL_PERSONAS } from "@/lib/chat/eval/personas";
import { detectRegister } from "@/lib/chat/language";
import { extractRupees } from "@/lib/chat/budget";

/**
 * The survey eval suite (#100). This file runs the DETERMINISTIC layer in CI:
 * for every real user phrasing, the language register and any numeric budget
 * must be read correctly - the two subsystems the epic's acceptance calls out
 * (Hinglish understanding + numeric budget) that don't need a live model.
 *
 * The model-backed layer (does routing send shopping -> Planner, does a real
 * catalog place come back, is a sensitive ask handled with care) needs a
 * provider key and a seeded DB, so it lives in a harness gated behind
 * CHAT_EVAL_LIVE and is skipped by default - see scenarios.ts `route`.
 */

describe("chat eval - deterministic layer (register + budget)", () => {
  it.each(EVAL_SCENARIOS)(
    "#$id reads register + budget: $text",
    (scenario) => {
      expect(detectRegister(scenario.text).register).toBe(scenario.register);
      expect(extractRupees(scenario.text)).toBe(scenario.rupees);
    },
  );

  it("keeps every survey phrasing distinct", () => {
    // Was pinned at exactly nine, which made adding a real user phrasing look
    // like a failure. What matters is that ids stay unique (the matrix keys on
    // them) and that the set does not quietly shrink.
    expect(EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(9);
    expect(new Set(EVAL_SCENARIOS.map((s) => s.id)).size).toBe(
      EVAL_SCENARIOS.length,
    );
    expect(new Set(EVAL_SCENARIOS.map((s) => s.text)).size).toBe(
      EVAL_SCENARIOS.length,
    );
  });

  it("routes at least one scenario to each non-trivial path", () => {
    const routes = new Set(EVAL_SCENARIOS.map((s) => s.route));
    for (const route of ["single_pick", "multi_stop", "shopping", "sensitive"]) {
      expect(routes.has(route as (typeof EVAL_SCENARIOS)[number]["route"])).toBe(true);
    }
  });

  it("describes a matrix big enough to measure divergence", () => {
    // Pick overlap is a pairwise measure: with two members one disagreement
    // swings it entirely, so the matrix needs at least three to mean anything.
    expect(EVAL_PERSONAS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(EVAL_PERSONAS.map((p) => p.id)).size).toBe(
      EVAL_PERSONAS.length,
    );
    // Every member is asked every scenario; this is what a live run costs.
    expect(EVAL_PERSONAS.length * EVAL_SCENARIOS.length).toBeGreaterThanOrEqual(
      27,
    );
  });
});
