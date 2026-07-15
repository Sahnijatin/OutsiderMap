import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completeStop, startQuest } from "@/lib/quests/machine";
import { QuestBriefSchema } from "@/lib/quests/generate";
import type { Database } from "@/types/database";

type Rpc = (name: string, args: Record<string, unknown>) => unknown;

function fakeClient(rpc: Rpc) {
  return { rpc } as unknown as SupabaseClient<Database>;
}

describe("startQuest", () => {
  it("passes the quest id to the RPC", async () => {
    let called: Record<string, unknown> | null = null;
    const client = fakeClient((name, args) => {
      expect(name).toBe("start_quest");
      called = args;
      return Promise.resolve({ data: null, error: null });
    });
    await startQuest(client, "q-1");
    expect(called).toEqual({ p_quest_id: "q-1" });
  });

  it("surfaces Postgres raise messages as readable errors", async () => {
    const client = fakeClient(() =>
      Promise.resolve({
        data: null,
        error: { message: "P0001: finish or abandon your active quest first" },
      }),
    );
    await expect(startQuest(client, "q-1")).rejects.toThrow(
      "finish or abandon your active quest first",
    );
  });
});

describe("completeStop", () => {
  it("maps mid-quest completion to the next stop", async () => {
    const client = fakeClient(() =>
      Promise.resolve({
        data: [{ quest_completed: false, next_stop_id: "s-2" }],
        error: null,
      }),
    );
    await expect(completeStop(client, "s-1", false)).resolves.toEqual({
      questCompleted: false,
      nextStopId: "s-2",
    });
  });

  it("maps the final stop to quest completion", async () => {
    const client = fakeClient(() =>
      Promise.resolve({
        data: [{ quest_completed: true, next_stop_id: null }],
        error: null,
      }),
    );
    await expect(completeStop(client, "s-3", true)).resolves.toEqual({
      questCompleted: true,
      nextStopId: null,
    });
  });

  it("forwards the media requirement flag", async () => {
    let args: Record<string, unknown> | null = null;
    const client = fakeClient((_name, a) => {
      args = a;
      return Promise.resolve({ data: [], error: null });
    });
    await completeStop(client, "s-1", true);
    expect(args).toEqual({ p_stop_id: "s-1", p_require_media: true });
  });
});

describe("QuestBriefSchema", () => {
  it("applies defaults", () => {
    const brief = QuestBriefSchema.parse({});
    expect(brief).toMatchObject({ first_time: false, interests: [], hours: 5 });
  });

  it("bounds hours and budget", () => {
    expect(() => QuestBriefSchema.parse({ hours: 1 })).toThrow();
    expect(() => QuestBriefSchema.parse({ budget_max: 5 })).toThrow();
  });
});
