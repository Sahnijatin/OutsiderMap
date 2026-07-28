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
    /** Rows the quest_stops lookup (prior plans' stops) returns. */
    questStops?: unknown[];
    /** DPDP consent flag on the profile. */
    personalizationEnabled?: boolean;
    /** The taste_profiles row, if this member has one. */
    taste?: unknown;
    /** Rows the bucket lookup returns, for the persona's recent saves. */
    savedPlaces?: unknown[];
    /** Override the places table - `null` models a lookup that finds nothing. */
    placesRows?: unknown;
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
    chain.maybeSingle = () =>
      Promise.resolve({
        data: Array.isArray(rows) ? (rows[0] ?? null) : rows,
        error: null,
      });
    chain.single = () => Promise.resolve({ data: rows, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: error ? null : rows, error }).then(resolve);
    return chain;
  };
  return {
    from: (name: string) => {
      if (name === "profiles") {
        return table({
          personalization_enabled: opts.personalizationEnabled ?? true,
          home_city: "delhi",
          display_name: "Rehan Malik",
        });
      }
      if (name === "taste_profiles") {
        return table(opts.taste ?? null);
      }
      if (name === "saved_places") {
        return table(opts.savedPlaces ?? null);
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
      if (name === "quest_stops") {
        return table(opts.questStops ?? null);
      }
      if (name === "places") {
        // Serves both the pick-assembly detail query (lat/lng + editor note)
        // and the single-row lookup for the place an ask started from.
        if ("placesRows" in opts) return table(opts.placesRows);
        return table([
          {
            slug: "spot-1",
            name: "Spot One",
            area: "GK",
            lat: 28.5,
            lng: 77.1,
            editor_note: "A classic editor blurb",
          },
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

  it("treats an earlier plan's stops as already recommended", async () => {
    let systemPrompt = "";
    let searchOut = "";
    runToolsImpl = async ({ tools, messages }) => {
      systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
      searchOut = String(await find(tools, "search_places").handler({ query: "pizza" }));
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(
      fakeSupabase({
        chatMessages: [
          { role: "assistant", content: "Plan built.", picks: null, plan_id: "q-77" },
        ],
        // The prior plan used spot-1 - the next turn must know that.
        questStops: [{ places: { slug: "spot-1", name: "Spot One" } }],
      }),
      "u1",
      { threadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", message: "another plan" },
    );
    expect(systemPrompt).toContain("Already recommended in this thread: Spot One");
    expect(searchOut).toContain('"already_shown":true');
  });

  it("sanitizes markdown and em dashes out of the reply", async () => {
    runToolsImpl = async () => ({
      text: "Start at **Olive Bar**—the courtyard is the draw.",
      usage: { inputTokens: 1, outputTokens: 1 },
      steps: 1,
      stoppedAtStepCap: false,
    });
    const { runChatTurn } = await import("@/lib/chat/engine");
    const result = await runChatTurn(fakeSupabase(), "u1", { message: "pizza" });
    expect(result.text).toBe("Start at Olive Bar - the courtyard is the draw.");
  });

  it("notes a built plan's id in the transcript so later turns can get_plan it", async () => {
    let historyContents: string[] = [];
    runToolsImpl = async ({ messages }) => {
      historyContents = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content);
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(
      fakeSupabase({
        chatMessages: [
          {
            role: "assistant",
            content: "Three stops in GK.",
            picks: null,
            plan_id: "q-77",
          },
        ],
      }),
      "u1",
      { threadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", message: "explain the plan" },
    );
    expect(historyContents.join("\n")).toContain("[built plan, plan_id: q-77]");
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

/**
 * The persona block reaching the model is the whole point of plan step A: the
 * taste profile has always been loaded on this path and handed only to the
 * toolbox, so a turn where the model skipped `get_user_behavior` was written
 * for a stranger.
 */
describe("runChatTurn - the member in the prompt", () => {
  const TASTE = {
    taste_summary: "You eat late and you eat standing up.",
    embedding: null,
    learned_signals: {
      event_count: 40,
      top_vibes: [{ tag: "late-night", score: 20 }],
      avoid_vibes: [{ tag: "fine-dining", score: -3 }],
      top_areas: ["Old Delhi"],
      active_hours: { morning: 0, afternoon: 1, evening: 4, late_night: 35 },
    },
    quiz_answers: {
      dimensions: {
        adventurousness: 0.8,
        budget_band: 1,
        social_energy: "solo",
        preferred_times: ["late-night"],
        cuisine_leanings: ["kebab"],
        vibe_keywords: ["hole-in-the-wall", "late-night"],
        areas: ["Old Delhi"],
        anchors: ["eats standing up and prefers it that way"],
      },
    },
  };

  /** Runs a turn and returns the system prompt the model was actually given. */
  async function systemPromptFor(supabase: SupabaseClient<Database>) {
    let system = "";
    runToolsImpl = async ({ messages }) => {
      system = String(messages.find((m) => m.role === "system")?.content ?? "");
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(supabase, "u1", { message: "something crispy" });
    return system;
  }

  it("puts the member's profile in front of the model", async () => {
    const system = await systemPromptFor(
      fakeSupabase({ taste: TASTE, savedPlaces: [{ places: { name: "Karim's" } }] }),
    );

    expect(system).toContain("<member_profile>");
    expect(system).toContain("Rehan.");
    expect(system).toContain("late-night");
    expect(system).toContain("Old Delhi");
    expect(system).toContain("eats standing up and prefers it that way");
    expect(system).toContain("Recently saved: Karim's.");
    // And it no longer sends the model off to fetch what it already has.
    expect(system).toContain("You already have their profile above");
  });

  it("sends nothing personal when the member opted out", async () => {
    // The DPDP gate, end to end: consent off means the taste row is never even
    // read, so there is nothing to leak into the prompt by accident.
    const system = await systemPromptFor(
      fakeSupabase({ taste: TASTE, personalizationEnabled: false }),
    );

    expect(system).not.toContain("<member_profile>");
    expect(system).not.toContain("Rehan");
    expect(system).not.toContain("Old Delhi");
    expect(system).not.toContain("eats standing up");
    expect(system).toContain("Personalization is off for this user");
  });

  it("never puts the taste summary in the prompt", async () => {
    // It is second-person prose about the member and would be handed straight
    // back to them. It stays behind get_user_behavior.
    const system = await systemPromptFor(fakeSupabase({ taste: TASTE }));
    expect(system).not.toContain("You eat late and you eat standing up");
  });

  it("falls back cleanly for a member with no taste profile yet", async () => {
    const system = await systemPromptFor(fakeSupabase());
    expect(system).not.toContain("<member_profile>");
    expect(system).toContain("Consult get_user_behavior to personalize");
  });
});

/**
 * Search results used to carry one number - `fit` - produced by blending the
 * member's taste vector into the query before retrieval. That perturbed the ask
 * and fused two signals into one scalar the model could not take apart, so a
 * reason could only ever paraphrase the editorial copy.
 */
describe("runChatTurn - separated ask and member signals", () => {
  const TASTE_GK = {
    taste_summary: "quiet corners",
    learned_signals: {
      event_count: 40,
      top_vibes: [{ tag: "study-spot", score: 20 }],
      avoid_vibes: [],
      top_areas: ["GK"],
      active_hours: { morning: 20, afternoon: 20, evening: 1, late_night: 0 },
    },
    quiz_answers: { dimensions: { budget_band: 2, anchors: ["reads and stays"] } },
  };

  /** Runs a turn and returns what search_places handed back to the model. */
  async function searchOutputFor(supabase: SupabaseClient<Database>) {
    let out = "";
    runToolsImpl = async ({ tools }) => {
      out = String(await find(tools, "search_places").handler({ query: "quiet" }));
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(supabase, "u1", { message: "somewhere quiet" });
    return out;
  }

  it("reports how well a place answers the ask, on its own", async () => {
    const out = await searchOutputFor(fakeSupabase({ taste: TASTE_GK }));
    expect(out).toContain("ask_fit");
    // The old blended name is gone; leaving it would tell the model the number
    // still means something it no longer means.
    expect(out).not.toContain('"fit"');
  });

  it("attaches the member's own evidence alongside it", async () => {
    const out = await searchOutputFor(fakeSupabase({ taste: TASTE_GK }));
    // The mocked candidate sits in GK, which is where this member actually goes.
    expect(out).toContain("for_you");
    expect(out).toContain("their_area");
  });

  it("attaches nothing personal when the member opted out", async () => {
    const out = await searchOutputFor(
      fakeSupabase({ taste: TASTE_GK, personalizationEnabled: false }),
    );
    expect(out).toContain("ask_fit");
    expect(out).not.toContain("for_you");
  });
});

/**
 * Chat was the only surface with no idea what the member was doing when they
 * asked: the city came from their profile regardless of what they were looking
 * at, and location never entered the picture at all - in a product that
 * promises to answer "it's 3am, I'm in GK2, surprise me".
 */
describe("runChatTurn - context at the point of asking", () => {
  async function systemAndSearch(
    supabase: SupabaseClient<Database>,
    context?: Record<string, unknown>,
  ) {
    let system = "";
    let search = "";
    runToolsImpl = async ({ messages, tools }) => {
      system = String(messages.find((m) => m.role === "system")?.content ?? "");
      search = String(await find(tools, "search_places").handler({ query: "x" }));
      return { text: "ok", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
    };
    const { runChatTurn } = await import("@/lib/chat/engine");
    await runChatTurn(supabase, "u1", { message: "something good", context });
    return { system, search };
  }

  it("measures distance from where the member is", async () => {
    // The mocked candidate sits at 28.5/77.1; this position is ~11km off.
    const { system, search } = await systemAndSearch(fakeSupabase(), {
      lat: 28.6,
      lng: 77.2,
    });
    expect(search).toContain("km_away");
    expect(system).toContain("Results carry km_away");
  });

  it("says nothing about distance when it has no position", async () => {
    const { system, search } = await systemAndSearch(fakeSupabase());
    expect(search).not.toContain("km_away");
    expect(system).toContain("You do NOT know where they are");
  });

  it("ignores a half-sent position rather than guessing the other half", async () => {
    const { search } = await systemAndSearch(fakeSupabase(), { lat: 28.6 });
    expect(search).not.toContain("km_away");
  });

  it("ignores null island", async () => {
    // Taking (0, 0) at face value would put every Delhi place ~7000km away.
    const { search } = await systemAndSearch(fakeSupabase(), { lat: 0, lng: 0 });
    expect(search).not.toContain("km_away");
  });

  it("knows the place an ask started from", async () => {
    const { system } = await systemAndSearch(fakeSupabase(), {
      placeSlug: "spot-1",
    });
    // The client sends a slug; the name is resolved server-side, so an
    // unpublished place or a chain can never become describable by routing
    // around search.
    expect(system).toContain("They opened this from Spot One in GK");
  });

  it("says nothing when the slug resolves to no place", async () => {
    const { system } = await systemAndSearch(
      fakeSupabase({ placesRows: null }),
      { placeSlug: "not-a-real-place" },
    );
    expect(system).not.toContain("They opened this from");
    expect(system).not.toContain("undefined");
  });
});
