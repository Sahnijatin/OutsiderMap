import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ADVERSARIAL_PERSONA,
  EVAL_PERSONAS,
  personaEmail,
  personaTokens,
  personaUserId,
} from "@/lib/chat/eval/personas";

/**
 * Fixture integrity for the personalization eval.
 *
 * These assertions exist because the eval's whole premise is that the personas
 * genuinely conflict and speak the catalog's own language. Both are easy to
 * break silently while editing fixtures - and a matrix built on personas that
 * quietly agree with each other would report "no personalization gap" no matter
 * how the product behaves.
 */

const catalog: {
  area: string;
  vibe_tags: string[];
  price_level: number;
}[] = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../data/places.delhi.json", import.meta.url)),
    "utf8",
  ),
);

const CATALOG_TAGS = new Set(catalog.flatMap((p) => p.vibe_tags));
const CATALOG_AREAS = new Set(catalog.map((p) => p.area));

describe("eval personas", () => {
  it("have unique ids and stable, well-formed user ids", () => {
    const ids = EVAL_PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const persona of EVAL_PERSONAS) {
      expect(personaUserId(persona)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      // Stability is the whole point - re-running must update, not accumulate.
      expect(personaUserId(persona)).toBe(personaUserId(persona));
    }

    const userIds = EVAL_PERSONAS.map(personaUserId);
    expect(new Set(userIds).size).toBe(userIds.length);
  });

  it("use only reserved, non-routable email addresses", () => {
    for (const persona of [...EVAL_PERSONAS, ADVERSARIAL_PERSONA]) {
      expect(personaEmail(persona)).toMatch(/@outsidermap\.invalid$/);
    }
  });

  it("speak the real catalog's vocabulary", () => {
    // Invented tags embed to nothing, which would make personas look identical
    // for a reason that has nothing to do with the product.
    for (const persona of EVAL_PERSONAS) {
      for (const tag of persona.dimensions.vibe_keywords) {
        expect(CATALOG_TAGS, `${persona.id}: vibe "${tag}"`).toContain(tag);
      }
      for (const area of persona.dimensions.areas) {
        expect(CATALOG_AREAS, `${persona.id}: area "${area}"`).toContain(area);
      }
      for (const tag of persona.learnedSignals?.top_vibes ?? []) {
        expect(CATALOG_TAGS, `${persona.id}: learned vibe "${tag.tag}"`).toContain(
          tag.tag,
        );
      }
    }
  });

  it("actually conflict with each other", () => {
    // Every pair must differ on most of their vibe vocabulary. Personas that
    // quietly agree would report a personalization gap that isn't there.
    for (let i = 0; i < EVAL_PERSONAS.length; i += 1) {
      for (let j = i + 1; j < EVAL_PERSONAS.length; j += 1) {
        const a = new Set(EVAL_PERSONAS[i].dimensions.vibe_keywords);
        const b = new Set(EVAL_PERSONAS[j].dimensions.vibe_keywords);
        let shared = 0;
        for (const tag of a) if (b.has(tag)) shared += 1;
        const jaccard = shared / (a.size + b.size - shared);
        expect(
          jaccard,
          `${EVAL_PERSONAS[i].id} vs ${EVAL_PERSONAS[j].id}`,
        ).toBeLessThan(0.34);
      }
    }
  });

  it("span the budget range so price filtering is exercised", () => {
    const bands = new Set(EVAL_PERSONAS.map((p) => p.dimensions.budget_band));
    expect(bands.size).toBeGreaterThanOrEqual(3);
    expect(Math.min(...bands)).toBe(1);
    expect(Math.max(...bands)).toBe(4);
  });

  it("cover the two states the plan needs to measure", () => {
    // Cold start: everyone under 8 events currently gets an identical explore
    // posture (adventurousness.ts) - the gap plan step 6 closes.
    expect(EVAL_PERSONAS.filter((p) => p.learnedSignals === null)).toHaveLength(
      1,
    );
    // Negative signal: the avoid_vibes path needs at least one persona.
    expect(
      EVAL_PERSONAS.some((p) => (p.learnedSignals?.avoid_vibes.length ?? 0) > 0),
    ).toBe(true);
  });

  it("produce usable tokens for reason scoring", () => {
    for (const persona of EVAL_PERSONAS) {
      const tokens = personaTokens(persona);
      expect(tokens.length).toBeGreaterThan(5);
      // Anchors contribute content words only; stopwords would match anything.
      expect(tokens.every((t) => t.length >= 3)).toBe(true);
    }
  });

  it("keeps the injection probe out of the divergence set", () => {
    // It is an assertion about prompt safety, not a taste. Averaging it into
    // the overlap number would muddy the metric it has nothing to do with.
    expect(EVAL_PERSONAS.map((p) => p.id)).not.toContain(
      ADVERSARIAL_PERSONA.id,
    );
    const probeText = [
      ...ADVERSARIAL_PERSONA.dimensions.anchors,
      ADVERSARIAL_PERSONA.tasteSummary,
    ].join(" ");
    expect(probeText.toLowerCase()).toContain("ignore");
    expect(probeText.toLowerCase()).toContain("system prompt");
  });
});
