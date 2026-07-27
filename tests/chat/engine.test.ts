import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AITool, RunToolsRequest, RunToolsResult } from "@/lib/ai/types";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

vi.mock("server-only", () => ({}));

// The "agent": each test sets what runTools does with the toolbox it's handed.
let runToolsImpl: (req: RunToolsRequest) => Promise<RunToolsResult>;

vi.mock("@/lib/ai", () => ({
  getAI: () => ({ name: "anthropic", runTools: (req: RunToolsRequest) => runToolsImpl(req) }),
  getEmbeddings: () => ({ embed: () => Promise.resolve([[0.1, 0.2]]) }),
}));

vi.mock("@/lib/catalog/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/catalog/search")>();
  const candidate = {
    id: "p1",
    slug: "spot-1",
    name: "Spot One",
    area: "GK",
    category: null,
    price_level: null,
    vibe_tags: [],
    description: null,
    editor_note: "A classic editor blurb",
    similarity: 0.9,
    hours: null,
    image_path: null,
    open: true,
    openLabel: null,
  };
  return {
    ...original,
    searchCatalog: () => Promise.resolve([candidate]),
    keywordSearch: () => Promise.resolve([candidate]),
  };
});

vi.mock("@/lib/cities", () => ({
  resolveCity: () =>
    Promise.resolve({
      slug: "delhi",
      name: "Delhi",
      lat: 28.6,
      lng: 77.2,
      zoom: 11,
      is_live: true,
      areas: ["GK"],
      created_at: "",
    }),
}));

function fakeSupabase(
  opts: {
    /** Prior thread messages the history query returns (newest-first). */
    chatMessages?: unknown[];
    /** Out-param: records every chat_threads.update payload. */
    threadUpdates?: unknown[];
    /** Every chat_messages query resolves with this error (schema drift). */
    messageError?: string;
  } = {},
) {
  const table = (
    rows: unknown,
    onUpdate?: (payload: unknown) => void,
    error: { message: string } | null = null,
  ) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "in", "insert", "upsert"]) {
      chain[m] = () => chain;
    }
    chain.update = (payload: unknown) => {
      onUpdate?.(payload);
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve({ data: rows, error: null });
    chain.single = () => Promise.resolve({ data: rows, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: error ? null : rows, error }).then(resolve);
    return chain;
  };
  return {
    from: (name: string) => {
      if (name === "profiles") {
        return table({ personalization_enabled: true, home_city: "delhi" });
      }
      if (name === "chat_threads") {
        return table({ id: "t-1" }, (p) => opts.threadUpdates?.push(p));
      }
      if (name === "chat_messages") {
        return table(
          opts.chatMessages ?? null,
          undefined,
          opts.messageError ? { message: opts.messageError } : null,
        );
      }
      if (name === "places") {
        // The pick-assembly detail query (lat/lng + the static editor note).
        return table([
          { slug: "spot-1", lat: 28.5, lng: 77.1, editor_note: "A classic editor blurb" },
        ]);
      }
      return table(null);
    },
    // No active experiments in tests → serve path uses default behavior.
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  runToolsImpl = () =>
    Promise.resolve({ text: "", usage: { inputTokens: 0, outputTokens: 0 }, steps: 1, stoppedAtStepCap: false });
});

const find = (tools: AITool[], name: string) => tools.find((t) => t.name === name)!;

describe("runChatTurn agent loop", () => {
  it("renders the places the agent chose to show_on_map", async () => {
    runToolsImpl = async ({ tools }) => {
      await find(tools, "search_places").handler({ query: "crispy" });
      await find(tools, "show_on_map").handler({
        picks: [{ slug: "spot-1", reason: "Crispy at this hour" }],
      });
      return { text: "Try Spot One.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 2, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "crispy please" });

    expect(result.type).toBe("picks");
    if (result.type !== "picks") throw new Error("expected picks");
    expect(result.text).toBe("Try Spot One.");
    expect(result.picks.map((p) => p.slug)).toEqual(["spot-1"]);
  });

  it("does not render places the agent never surfaced (grounding)", async () => {
    runToolsImpl = async ({ tools }) => {
      // Skip search; try to show a place that was never surfaced.
      await find(tools, "show_on_map").handler({
        picks: [{ slug: "hallucinated", reason: "made up" }],
      });
      return { text: "Here.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "go" });
    // Nothing grounded was shown, so it degrades to a conversational reply.
    expect(result.type).toBe("ask");
  });

  it("returns an ask when the agent shows nothing", async () => {
    runToolsImpl = async () => ({
      text: "Where in the city, and what's the mood?",
      usage: { inputTokens: 1, outputTokens: 1 },
      steps: 1,
      stoppedAtStepCap: false,
    });
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "hmm" });
    expect(result.type).toBe("ask");
    expect(result.text).toContain("mood");
  });

  it("falls back to keyword search when the agent loop throws", async () => {
    runToolsImpl = () => Promise.reject(new Error("provider down"));
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "anything good" });
    expect(result.type).toBe("picks");
    if (result.type !== "picks") throw new Error("expected picks");
    expect(result.picks.map((p) => p.slug)).toEqual(["spot-1"]);
  });
});

describe("honest pick reasons", () => {
  it("uses the model's per-pick reason, not the editor note", async () => {
    runToolsImpl = async ({ tools }) => {
      await find(tools, "search_places").handler({ query: "quiet" });
      await find(tools, "show_on_map").handler({
        picks: [
          {
            slug: "spot-1",
            reason: "You asked for quiet - the back room stays empty past nine",
          },
        ],
      });
      return { text: "Spot One.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 2, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "quiet please" });

    expect(result.type).toBe("picks");
    if (result.type !== "picks") throw new Error("expected picks");
    expect(result.picks[0].reason).toBe(
      "You asked for quiet - the back room stays empty past nine",
    );
    expect(result.picks[0].reason).not.toBe("A classic editor blurb");
    expect(result.picks[0].reasonSource).toBe("model");
    expect(result.degraded).toBeUndefined();
  });

  it("falls back to the editor note ONLY when the model omits a reason, and marks it", async () => {
    runToolsImpl = async ({ tools }) => {
      await find(tools, "search_places").handler({ query: "quiet" });
      await find(tools, "show_on_map").handler({ picks: [{ slug: "spot-1" }] });
      return { text: "Spot One.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 2, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "quiet please" });

    expect(result.type).toBe("picks");
    if (result.type !== "picks") throw new Error("expected picks");
    expect(result.picks[0].reason).toBe("A classic editor blurb");
    expect(result.picks[0].reasonSource).toBe("editor_note");
  });
});

describe("repeat suppression (thread memory)", () => {
  // Newest-first, as the history query returns them.
  const priorMessages = [
    {
      role: "assistant",
      content: "Try Spot One.",
      picks: [{ slug: "spot-1", name: "Spot One" }],
    },
    { role: "user", content: "crispy please", picks: null },
  ];

  it("tells the model what it already recommended in this thread", async () => {
    let systemPrompt = "";
    let historyContents: string[] = [];
    runToolsImpl = async ({ messages }) => {
      systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
      historyContents = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content);
      return { text: "Something new then.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(fakeSupabase({ chatMessages: priorMessages }), "u1", {
      threadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      message: "something else",
    });

    // The system prompt names prior picks; the transcript inlines the cards
    // the user actually saw, so the model can stop re-serving them.
    expect(systemPrompt).toContain("Already recommended in this thread: Spot One");
    expect(historyContents.join("\n")).toContain("[recommended: Spot One (spot-1)]");
  });

  it("marks already-shown places in search results", async () => {
    let searchOut = "";
    runToolsImpl = async ({ tools }) => {
      searchOut = String(await find(tools, "search_places").handler({ query: "crispy" }));
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(fakeSupabase({ chatMessages: priorMessages }), "u1", {
      threadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      message: "more crispy",
    });
    expect(searchOut).toContain('"already_shown":true');
  });

  it("does not flag anything on a fresh thread", async () => {
    let searchOut = "";
    runToolsImpl = async ({ tools, messages }) => {
      searchOut = String(await find(tools, "search_places").handler({ query: "crispy" }));
      expect(messages.find((m) => m.role === "system")?.content).not.toContain(
        "Already recommended",
      );
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(fakeSupabase(), "u1", { message: "crispy" });
    expect(searchOut).not.toContain("already_shown");
  });
});

describe("clarify budget lifecycle", () => {
  it("resets questions_asked once picks are served (ask cycle over)", async () => {
    const threadUpdates: unknown[] = [];
    runToolsImpl = async ({ tools }) => {
      await find(tools, "search_places").handler({ query: "crispy" });
      await find(tools, "show_on_map").handler({
        picks: [{ slug: "spot-1", reason: "Crispy at this hour" }],
      });
      return { text: "Spot One.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 2, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(fakeSupabase({ threadUpdates }), "u1", { message: "crispy" });
    expect(threadUpdates[0]).toMatchObject({ intent_state: { questions_asked: 0 } });
  });

  it("counts a clarifying question against the budget", async () => {
    const threadUpdates: unknown[] = [];
    runToolsImpl = async () => ({
      text: "How long do you have, and which side of town?",
      usage: { inputTokens: 1, outputTokens: 1 },
      steps: 1,
      stoppedAtStepCap: false,
    });
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(fakeSupabase({ threadUpdates }), "u1", { message: "plan my day" });
    expect(threadUpdates[0]).toMatchObject({ intent_state: { questions_asked: 1 } });
  });

  it("resets the budget when a plain answer closes the ask", async () => {
    const threadUpdates: unknown[] = [];
    runToolsImpl = async () => ({
      text: "It opens at nine.",
      usage: { inputTokens: 1, outputTokens: 1 },
      steps: 1,
      stoppedAtStepCap: false,
    });
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(fakeSupabase({ threadUpdates }), "u1", { message: "when does it open" });
    expect(threadUpdates[0]).toMatchObject({ intent_state: { questions_asked: 0 } });
  });
});

describe("persistence failures are loud, not fatal", () => {
  it("still serves the turn when message inserts fail, and logs the loss", async () => {
    // The real incident: prod was missing the `degraded` column, every
    // assistant-message insert failed silently, and threads reopened empty.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    runToolsImpl = async ({ tools }) => {
      await find(tools, "search_places").handler({ query: "crispy" });
      await find(tools, "show_on_map").handler({
        picks: [{ slug: "spot-1", reason: "Crispy at this hour" }],
      });
      return { text: "Try Spot One.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 2, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(
      fakeSupabase({ messageError: 'column "degraded" does not exist' }),
      "u1",
      { message: "crispy" },
    );

    // The live answer still reaches the user...
    expect(result.type).toBe("picks");
    // ...but the lost transcript is on the record, greppable.
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("persist failed");
    errorSpy.mockRestore();
  });
});

describe("honest degradation", () => {
  it("flags the keyword fallback as degraded and never fakes personalization", async () => {
    runToolsImpl = () => Promise.reject(new Error("provider down"));
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "anything good" });

    expect(result.type).toBe("picks");
    if (result.type !== "picks") throw new Error("expected picks");
    expect(result.degraded).toBe(true);
    // Fallback picks carry the static note, marked as such - no fake "for you".
    expect(result.picks[0].reasonSource).toBe("editor_note");
    // The lead-in must not claim a personalized fit.
    expect(result.text).not.toBe("Here's what fits best right now:");
  });

  it("does not flag a healthy turn as degraded", async () => {
    runToolsImpl = async ({ tools }) => {
      await find(tools, "search_places").handler({ query: "crispy" });
      await find(tools, "show_on_map").handler({
        picks: [{ slug: "spot-1", reason: "Crispy at this hour" }],
      });
      return { text: "Try Spot One.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 2, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "crispy" });
    expect(result.degraded).toBeUndefined();
  });
});
