import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import { pendingVisitCheck } from "@/lib/chat/followup";

/**
 * "Did you make it to X?" - the only question that asks about the world rather
 * than about the app, and so the only source of the `visit` signal the learning
 * loop weights above a click.
 *
 * Every test here is about restraint. The prompt is worth having exactly as
 * long as it stays rare and never asks something already answered; a nudge that
 * repeats itself trains people to dismiss the surface without reading it, which
 * costs more than the signal is worth.
 */

/** Records the filters applied so window and exclusion logic are inspectable. */
interface Call {
  table: string;
  filters: Array<[string, ...unknown[]]>;
}

interface Rows {
  /** The chat_pick_click read: what they clicked in the window. */
  clicks?: Array<{ place_id: string | null }>;
  /** The visit/dismiss read: what they have already told us about. */
  answered?: Array<{ place_id: string }>;
  /** The places lookup, resolved through maybeSingle. */
  place?: { id: string; slug: string; name: string } | null;
}

/**
 * Minimal PostgREST stand-in. `interaction_events` is read twice with different
 * intent, so the two reads are seeded separately - sharing one row set made the
 * clicks look like their own answers.
 */
function fakeSupabase(rows: Rows, failOn?: string) {
  const calls: Call[] = [];
  let eventReads = 0;

  const client = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);

      const dataFor = () => {
        if (table === "interaction_events") {
          eventReads += 1;
          return eventReads === 1 ? (rows.clicks ?? []) : (rows.answered ?? []);
        }
        return rows.place ? [rows.place] : [];
      };

      const chain: Record<string, unknown> = {
        // `maybeSingle` narrows to one row the way PostgREST does; returning the
        // array here would let a broken caller pass.
        maybeSingle: () => ({
          then: (resolve: (v: unknown) => unknown) => {
            if (table === failOn) throw new Error(`${table} is down`);
            return Promise.resolve({
              data: dataFor()[0] ?? null,
              error: null,
            }).then(resolve);
          },
        }),
        then: (resolve: (v: unknown) => unknown) => {
          if (table === failOn) throw new Error(`${table} is down`);
          return Promise.resolve({ data: dataFor(), error: null }).then(resolve);
        },
      };
      for (const method of [
        "select",
        "eq",
        "in",
        "not",
        "gte",
        "lte",
        "order",
        "limit",
      ]) {
        chain[method] = (...args: unknown[]) => {
          call.filters.push([method, ...args]);
          return chain;
        };
      }
      return chain;
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}

const PLACE = { id: "p1", slug: "karims", name: "Karim's" };

describe("pendingVisitCheck", () => {
  it("asks about the most recent unanswered click", async () => {
    const { client } = fakeSupabase({
      clicks: [{ place_id: "p1" }],
      answered: [],
      place: PLACE,
    });

    expect(await pendingVisitCheck(client, "u1")).toEqual({
      placeId: "p1",
      slug: "karims",
      name: "Karim's",
    });
  });

  it("says nothing when they have clicked nothing in the window", async () => {
    const { client, calls } = fakeSupabase({ clicks: [], place: PLACE });
    expect(await pendingVisitCheck(client, "u1")).toBeNull();
    // And stops there: no point asking what is settled when nothing is pending.
    expect(calls).toHaveLength(1);
  });

  it("bounds the question to a window on both sides", async () => {
    // Both halves matter and for different reasons: without the lower bound it
    // asks mid-visit, and without the upper it asks about a Tuesday nobody
    // remembers. A wrong answer is worse than no answer - it teaches the loop
    // something false about a place.
    const { client, calls } = fakeSupabase({ clicks: [] });
    await pendingVisitCheck(client, "u1");

    const clicks = calls[0];
    const from = clicks.filters.find(([m]) => m === "gte")?.[2] as string;
    const to = clicks.filters.find(([m]) => m === "lte")?.[2] as string;
    expect(from).toBeDefined();
    expect(to).toBeDefined();

    // 12 to 72 hours old, allowing a second of slack for the clock ticking
    // between the two Date.now()-derived bounds.
    const hoursAgo = (iso: string) => (Date.now() - Date.parse(iso)) / 3_600_000;
    expect(hoursAgo(to)).toBeCloseTo(12, 1);
    expect(hoursAgo(from)).toBeCloseTo(72, 1);
    expect(Date.parse(from)).toBeLessThan(Date.parse(to));
  });

  it("only considers clicks that name a place", async () => {
    // `chat_pick_click` is the one chat event carrying a place_id; `query` and
    // `answer_served` are not per-place and would resolve to nothing.
    const { client, calls } = fakeSupabase({ clicks: [] });
    await pendingVisitCheck(client, "u1");

    expect(calls[0].filters).toContainEqual([
      "eq",
      "event_type",
      "chat_pick_click",
    ]);
    expect(calls[0].filters).toContainEqual(["not", "place_id", "is", null]);
  });

  it("skips a place they already settled and moves to the next one", async () => {
    // Asking again about somewhere they already told us about reads as not
    // listening, which is the specific way this surface would become annoying.
    const { client } = fakeSupabase({
      clicks: [{ place_id: "p1" }, { place_id: "p2" }],
      answered: [{ place_id: "p1" }],
      place: { id: "p2", slug: "second", name: "Second" },
    });

    expect(await pendingVisitCheck(client, "u1")).toMatchObject({
      slug: "second",
    });
  });

  it("counts a dismiss as settled, not just a visit", async () => {
    // "Not this" on the card is already an answer. Following it with "did you
    // go?" would be the app arguing with them.
    const { client, calls } = fakeSupabase({
      clicks: [{ place_id: "p1" }],
      answered: [{ place_id: "p1" }],
      place: PLACE,
    });

    expect(await pendingVisitCheck(client, "u1")).toBeNull();
    // Both event types settle it, so one query covers them.
    expect(calls[1].filters).toContainEqual([
      "in",
      "event_type",
      ["visit", "dismiss"],
    ]);
  });

  it("ignores a click row whose place_id came back null", async () => {
    // The `.not(...)` filter should make this impossible, but the column is
    // nullable and the type says so - a null slipping through would look up a
    // place named `null` rather than skipping.
    const { client } = fakeSupabase({
      clicks: [{ place_id: null }],
      answered: [],
      place: PLACE,
    });
    expect(await pendingVisitCheck(client, "u1")).toBeNull();
  });

  it("stays quiet when the place has since been unpublished", async () => {
    const { client } = fakeSupabase({
      clicks: [{ place_id: "p1" }],
      answered: [],
      place: null,
    });
    expect(await pendingVisitCheck(client, "u1")).toBeNull();
  });

  it("returns null rather than throwing when a query fails", async () => {
    // This runs in the chat page's render path. A missing nudge costs one
    // signal; a thrown one costs the whole page.
    const { client } = fakeSupabase({}, "interaction_events");
    await expect(pendingVisitCheck(client, "u1")).resolves.toBeNull();
  });
});
