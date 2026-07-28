import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import { loadPersona } from "@/lib/chat/persona";

/**
 * `loadPersona` covers the consent gate and the defensive parsing of two
 * columns that have survived several shape changes. Both are places where a
 * quiet failure would be worse than a loud one: the first is a legal question,
 * and the second decides whether a member's whole profile silently evaporates.
 */

type TableRows = Record<string, unknown[]>;

/**
 * Minimal PostgREST stand-in: every builder method returns the chain, and the
 * chain resolves to whatever rows the table was seeded with. `failOn` makes one
 * table throw, to exercise the best-effort paths.
 */
function fakeSupabase(rows: TableRows, failOn?: string) {
  const queried: string[] = [];

  const client = {
    from(table: string) {
      queried.push(table);
      const chain: Record<string, unknown> = {
        then(resolve: (v: unknown) => unknown) {
          if (table === failOn) throw new Error(`${table} is down`);
          return Promise.resolve({ data: rows[table] ?? [], error: null }).then(
            resolve,
          );
        },
      };
      for (const method of ["select", "eq", "order", "limit", "in", "not"]) {
        chain[method] = () => chain;
      }
      return chain;
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    queried,
  };
}

const DIMENSIONS = {
  adventurousness: 0.8,
  budget_band: 1,
  social_energy: "solo",
  preferred_times: ["late-night"],
  cuisine_leanings: ["kebab"],
  vibe_keywords: ["hole-in-the-wall", "late-night", "street-side"],
  areas: ["Old Delhi"],
  anchors: ["eats standing up and prefers it that way"],
};

const SIGNALS = {
  updated_at: "2026-01-01T00:00:00.000Z",
  event_count: 40,
  save_rate: 0.3,
  top_vibes: [
    { tag: "late-night", score: 20 },
    { tag: "hole-in-the-wall", score: 12 },
    { tag: "fine-dining", score: -3 },
  ],
  avoid_vibes: [{ tag: "fine-dining", score: -3 }],
  top_areas: ["Old Delhi"],
  active_hours: { morning: 1, afternoon: 2, evening: 6, late_night: 40 },
};

describe("loadPersona", () => {
  it("returns null and touches nothing when personalization is off", async () => {
    // The DPDP gate. It must fail closed, and it must not even look: a member
    // who opted out should not have their bucket read to build a block that is
    // then discarded.
    const { client, queried } = fakeSupabase({});
    const persona = await loadPersona(client, "u1", false, {
      displayName: "Rehan",
      quizAnswers: { dimensions: DIMENSIONS },
      learnedSignals: SIGNALS,
    });

    expect(persona).toBeNull();
    expect(queried).toEqual([]);
  });

  it("builds the member from quiz dimensions and learned behaviour", async () => {
    const { client } = fakeSupabase({
      saved_places: [{ places: { name: "Karim's" } }],
      interaction_events: [],
    });

    const persona = await loadPersona(client, "u1", true, {
      displayName: "Rehan Malik",
      quizAnswers: { dimensions: DIMENSIONS },
      learnedSignals: SIGNALS,
    });

    expect(persona).not.toBeNull();
    expect(persona!.firstName).toBe("Rehan");
    expect(persona!.anchors).toEqual(DIMENSIONS.anchors);
    expect(persona!.budgetBand).toBe(1);
    expect(persona!.social).toBe("solo");
    // Only positively-scored vibes are "rewards"; the negative one is an avoid.
    expect(persona!.vibes).toEqual(["late-night", "hole-in-the-wall"]);
    expect(persona!.avoidVibes).toEqual(["fine-dining"]);
    expect(persona!.activeHours).toBe("late nights");
    expect(persona!.savedRecently).toEqual(["Karim's"]);
    expect(persona!.eventCount).toBe(40);
  });

  it("resolves dismissed places and keeps them in recency order", async () => {
    // The `in` lookup returns rows in whatever order it likes, so the event
    // order has to be reapplied - "recently passed on" is worthless unsorted.
    const { client } = fakeSupabase({
      saved_places: [],
      interaction_events: [
        { place_id: "p3" },
        { place_id: "p1" },
        { place_id: "p2" },
      ],
      places: [
        { id: "p1", name: "First" },
        { id: "p2", name: "Second" },
        { id: "p3", name: "Third" },
      ],
    });

    const persona = await loadPersona(client, "u1", true, {
      displayName: null,
      quizAnswers: { dimensions: DIMENSIONS },
      learnedSignals: SIGNALS,
    });

    expect(persona!.passedRecently).toEqual(["Third", "First", "Second"]);
  });

  it("degrades to an empty profile rather than throwing on malformed columns", async () => {
    // These two columns are plain jsonb and predate several shape changes; a
    // parse failure must cost colour, never the turn.
    const { client } = fakeSupabase({ saved_places: [], interaction_events: [] });

    const persona = await loadPersona(client, "u1", true, {
      displayName: "Ira",
      quizAnswers: { dimensions: { nonsense: true } },
      learnedSignals: "not an object at all",
    });

    expect(persona).not.toBeNull();
    expect(persona!.anchors).toEqual([]);
    expect(persona!.vibes).toEqual([]);
    expect(persona!.eventCount).toBe(0);
    expect(persona!.firstName).toBe("Ira");
  });

  it("keeps the fields it can read when the stored row fails strict validation", async () => {
    // The regression this pins: reading with TasteDimensionsSchema is
    // all-or-nothing, so one out-of-range field - a v1 row, a hand-edit, an
    // extraction that drifted - dropped the whole dimensions object and the
    // member vanished from their own prompt. Exactly the silently-generic
    // failure the block exists to fix.
    const { client } = fakeSupabase({ saved_places: [], interaction_events: [] });

    const persona = await loadPersona(client, "u1", true, {
      displayName: "Rehan",
      quizAnswers: {
        dimensions: {
          // Would fail the write-time schema: two vibe keywords, not three.
          vibe_keywords: ["hole-in-the-wall", "late-night"],
          budget_band: 1,
          anchors: ["eats standing up and prefers it that way"],
          cuisine_leanings: ["kebab"],
          social_energy: "solo",
          preferred_times: ["late-night"],
        },
      },
      learnedSignals: SIGNALS,
    });

    expect(persona!.anchors).toEqual(["eats standing up and prefers it that way"]);
    expect(persona!.budgetBand).toBe(1);
    expect(persona!.cuisines).toEqual(["kebab"]);
  });

  it("drops only the field that is malformed, not its neighbours", async () => {
    const { client } = fakeSupabase({ saved_places: [], interaction_events: [] });

    const persona = await loadPersona(client, "u1", true, {
      displayName: "Rehan",
      quizAnswers: {
        dimensions: {
          budget_band: 99, // out of range
          anchors: ["still perfectly readable"],
          social_energy: "solo",
        },
      },
      learnedSignals: SIGNALS,
    });

    expect(persona!.budgetBand).toBe(0); // dropped
    expect(persona!.anchors).toEqual(["still perfectly readable"]); // kept
    expect(persona!.social).toBe("solo"); // kept
  });

  it("survives a failing history query", async () => {
    const { client } = fakeSupabase(
      { interaction_events: [] },
      "saved_places",
    );

    const persona = await loadPersona(client, "u1", true, {
      displayName: "Rehan",
      quizAnswers: { dimensions: DIMENSIONS },
      learnedSignals: SIGNALS,
    });

    expect(persona!.savedRecently).toEqual([]);
    expect(persona!.anchors).toEqual(DIMENSIONS.anchors);
  });

  it("reports no active hours when there is too little behaviour to claim one", async () => {
    const { client } = fakeSupabase({ saved_places: [], interaction_events: [] });

    const persona = await loadPersona(client, "u1", true, {
      displayName: "Anaya",
      quizAnswers: { dimensions: DIMENSIONS },
      learnedSignals: {
        event_count: 2,
        active_hours: { morning: 0, afternoon: 1, evening: 1, late_night: 0 },
      },
    });

    // Two events is not a pattern. Naming one would be a confident guess.
    expect(persona!.activeHours).toBeNull();
    expect(persona!.posture).toBe("explore");
  });
});
