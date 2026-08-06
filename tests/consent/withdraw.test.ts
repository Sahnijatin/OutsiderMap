import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { purgeDerivedData } from "@/lib/consent/withdraw";

/**
 * The consequence of withdrawal. The case that matters most is the one that
 * looks like an omission: the taste profile row is UPDATED, not deleted, and
 * the member's own quiz answers survive. They are what the member gave us;
 * only the machine's conclusions about them are ours to destroy. Deleting the
 * row would also break retryTasteRead() and force a re-quiz on re-grant.
 */

type Call = { table: string; op: string; payload?: unknown };

function fakeAdmin(options: {
  tasteRow?: { quiz_answers: unknown } | null;
  failOn?: string;
} = {}) {
  const calls: Call[] = [];
  const { tasteRow = { quiz_answers: { version: 3, answers: { a: 1 }, dimensions: { d: 2 } } } } =
    options;

  const admin = {
    from(table: string) {
      const fail = options.failOn === table;
      return {
        select() {
          calls.push({ table, op: "select" });
          return {
            eq() {
              return {
                maybeSingle: async () =>
                  fail
                    ? { data: null, error: { message: "boom" } }
                    : { data: tasteRow, error: null },
              };
            },
          };
        },
        update(payload: unknown) {
          calls.push({ table, op: "update", payload });
          return {
            eq: async () =>
              fail ? { error: { message: "boom" } } : { error: null },
          };
        },
        delete() {
          return {
            eq() {
              return {
                select: async () => {
                  calls.push({ table, op: "delete" });
                  return fail
                    ? { data: null, error: { message: "boom" } }
                    : { data: [{ id: 1 }, { id: 2 }], error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;

  return { admin, calls };
}

describe("purgeDerivedData", () => {
  it("does nothing at all when there is nothing to purge", async () => {
    const { admin, calls } = fakeAdmin();
    const result = await purgeDerivedData(admin, "u-1", []);
    expect(calls).toEqual([]);
    expect(result).toEqual({
      tasteCleared: false,
      memoriesDeleted: 0,
      eventsDeleted: 0,
      errors: [],
    });
  });

  it("clears the derived taste columns without deleting the row", async () => {
    const { admin, calls } = fakeAdmin();
    const result = await purgeDerivedData(admin, "u-1", ["taste_derived"]);

    const update = calls.find(
      (c) => c.table === "taste_profiles" && c.op === "update",
    );
    expect(update, "taste profile must be updated, not deleted").toBeDefined();
    expect(
      calls.find((c) => c.table === "taste_profiles" && c.op === "delete"),
    ).toBeUndefined();

    const payload = update!.payload as Record<string, unknown>;
    expect(payload.embedding).toBeNull();
    expect(payload.taste_summary).toBeNull();
    expect(payload.learned_signals).toEqual({});
    expect(result.tasteCleared).toBe(true);
  });

  it("keeps the member's answers and strips only the inferred dimensions", async () => {
    const { admin, calls } = fakeAdmin();
    await purgeDerivedData(admin, "u-1", ["taste_derived"]);

    const payload = calls.find((c) => c.op === "update")!.payload as {
      quiz_answers: Record<string, unknown>;
    };
    expect(payload.quiz_answers).toEqual({ version: 3, answers: { a: 1 } });
    expect(payload.quiz_answers.dimensions).toBeUndefined();
  });

  it("skips the taste update when there is no profile row", async () => {
    const { admin, calls } = fakeAdmin({ tasteRow: null });
    const result = await purgeDerivedData(admin, "u-1", ["taste_derived"]);
    expect(calls.find((c) => c.op === "update")).toBeUndefined();
    expect(result.tasteCleared).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it("deletes remembered facts and reports the count", async () => {
    const { admin, calls } = fakeAdmin();
    const result = await purgeDerivedData(admin, "u-1", ["member_memory"]);
    expect(calls).toContainEqual({ table: "member_memory", op: "delete" });
    expect(result.memoriesDeleted).toBe(2);
  });

  it("deletes the behavioural log and reports the count", async () => {
    const { admin, calls } = fakeAdmin();
    const result = await purgeDerivedData(admin, "u-1", ["interaction_events"]);
    expect(calls).toContainEqual({ table: "interaction_events", op: "delete" });
    expect(result.eventsDeleted).toBe(2);
  });

  it("runs all three targets for a personalization withdrawal", async () => {
    const { admin, calls } = fakeAdmin();
    const result = await purgeDerivedData(admin, "u-1", [
      "taste_derived",
      "member_memory",
      "interaction_events",
    ]);
    expect(calls.map((c) => c.table)).toContain("taste_profiles");
    expect(calls.map((c) => c.table)).toContain("member_memory");
    expect(calls.map((c) => c.table)).toContain("interaction_events");
    expect(result.errors).toEqual([]);
  });

  it("keeps going after a failure and accumulates rather than throwing", async () => {
    // A half-finished purge that reports success is the failure mode worth
    // preventing: the daily reconciliation sweep can only finish what it is
    // told went wrong.
    const { admin, calls } = fakeAdmin({ failOn: "member_memory" });
    const result = await purgeDerivedData(admin, "u-1", [
      "taste_derived",
      "member_memory",
      "interaction_events",
    ]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("member memory");
    expect(result.tasteCleared).toBe(true);
    expect(result.eventsDeleted).toBe(2);
    expect(calls.map((c) => c.table)).toContain("interaction_events");
  });
});
