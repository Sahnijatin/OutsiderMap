import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import {
  EVAL_PERSONAS,
  personaSourceFor,
  type EvalPersona,
} from "@/lib/chat/eval/personas";
import { loadPersona, renderPersona } from "@/lib/chat/persona";
import { agentSystem } from "@/lib/chat/prompts";
import { profileBlockOf, promptOverlap } from "@/lib/chat/eval/metrics";

/**
 * The half of the personalization eval that needs no model, no database and no
 * keys - and therefore the half that can gate every commit.
 *
 * Putting the member in the prompt changed the *input* to the model. That is
 * measurable here, exactly: build the real system prompt five different members
 * would receive and check the five differ. It cannot tell you whether the
 * answers differ - only the live matrix can - but if this stays high and pick
 * overlap later comes back high too, the failure is in ranking and retrieval
 * rather than in context, which is a different fix entirely.
 */

/** Any query at all is a bug: this gate must stay runnable in bare CI. */
const noDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "prompt divergence must not need a database - use includeHistory: false",
      );
    },
  },
) as unknown as SupabaseClient<Database>;

async function promptFor(persona: EvalPersona): Promise<string> {
  const loaded = await loadPersona(
    noDatabase,
    "eval-user",
    true,
    personaSourceFor(persona),
    { includeHistory: false },
  );
  return agentSystem({
    cityName: "Delhi",
    areas: ["Old Delhi", "Khan Market", "Hauz Khas", "Nizamuddin"],
    timeLabel: "Sat 21:00 IST",
    questionsAsked: 0,
    personalize: true,
    persona: renderPersona(loaded),
  });
}

async function allPrompts() {
  return Promise.all(
    EVAL_PERSONAS.map(async (p) => ({
      personaId: p.id,
      prompt: await promptFor(p),
    })),
  );
}

describe("prompt divergence across members", () => {
  it("gives every member a profile block", async () => {
    for (const { personaId, prompt } of await allPrompts()) {
      expect(profileBlockOf(prompt), personaId).not.toBeNull();
    }
  });

  it("keeps shared taste vocabulary low across members", async () => {
    const { overlap, comparedPersonas, skippedEmpty } = promptOverlap(
      await allPrompts(),
    );

    expect(skippedEmpty).toBe(0);
    expect(comparedPersonas).toBe(EVAL_PERSONAS.length);
    expect(overlap).not.toBeNull();

    // Measured at 0.10 when the block first shipped, then 0.07 once the dial
    // stopped handing every new member the same default and started reading
    // their quiz answer. Most of the residue is the explore/exploit guidance,
    // which has only three possible values, so two members who land on the same
    // posture genuinely share a sentence - counted rather than excluded, which
    // makes the gate conservative.
    //
    // The threshold sits at roughly twice the measurement: loose enough that
    // ordinary fixture edits do not trip it, tight enough that a prompt change
    // which quietly stops threading the member through does. A regression gate,
    // not a target - driving this toward zero would mean nothing.
    expect(overlap!).toBeLessThan(0.2);
  });

  it("gives no two members the same prompt", async () => {
    const prompts = await allPrompts();
    const blocks = prompts.map((p) => profileBlockOf(p.prompt));
    expect(new Set(blocks).size).toBe(prompts.length);
  });

  it("carries each member's own vocabulary, not a generic summary", async () => {
    for (const persona of EVAL_PERSONAS) {
      const block = profileBlockOf(await promptFor(persona))!;
      // Behaviour vocabulary for members who have any; quiz vocabulary for the
      // cold-start one, who has no learned signals at all.
      const expected =
        persona.learnedSignals?.top_vibes.map((v) => v.tag) ??
        persona.dimensions.cuisine_leanings;
      for (const token of expected.slice(0, 2)) {
        expect(block, `${persona.id} should mention "${token}"`).toContain(
          token,
        );
      }
    }
  });

  it("collapses to near-total overlap if the member is dropped", async () => {
    // The control. Without the block every member gets a byte-identical prompt,
    // which is the state this work exists to move away from - and is what a
    // regression would look like.
    const withoutPersona = EVAL_PERSONAS.map((p) => ({
      personaId: p.id,
      prompt: agentSystem({
        cityName: "Delhi",
        areas: ["Old Delhi"],
        timeLabel: "Sat 21:00 IST",
        questionsAsked: 0,
        personalize: true,
      }),
    }));

    expect(new Set(withoutPersona.map((p) => p.prompt)).size).toBe(1);
    // No block at all -> nothing to compare -> the metric refuses to score it.
    expect(promptOverlap(withoutPersona).overlap).toBeNull();
  });
});
