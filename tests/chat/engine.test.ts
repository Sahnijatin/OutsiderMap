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
    editor_note: null,
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

function fakeSupabase() {
  const table = (rows: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "in", "update", "insert", "upsert"]) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = () => Promise.resolve({ data: rows, error: null });
    chain.single = () => Promise.resolve({ data: rows, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
    return chain;
  };
  return {
    from: (name: string) => {
      if (name === "profiles") {
        return table({ personalization_enabled: true, home_city: "delhi" });
      }
      if (name === "chat_threads") return table({ id: "t-1" });
      return table(null);
    },
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
      await find(tools, "show_on_map").handler({ slugs: ["spot-1"] });
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
      await find(tools, "show_on_map").handler({ slugs: ["hallucinated"] });
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
