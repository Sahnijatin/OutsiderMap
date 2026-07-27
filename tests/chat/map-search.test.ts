import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AITool, RunToolsRequest, RunToolsResult } from "@/lib/ai/types";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

vi.mock("server-only", () => ({}));

let runToolsImpl: (req: RunToolsRequest) => Promise<RunToolsResult>;
let seenToolNames: string[] = [];

vi.mock("@/lib/ai", () => ({
  getAI: () => ({
    name: "anthropic",
    runTools: (req: RunToolsRequest) => {
      seenToolNames = req.tools.map((t) => t.name);
      return runToolsImpl(req);
    },
  }),
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
    for (const m of ["select", "eq", "in", "order", "limit"]) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: rows, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
    return chain;
  };
  return {
    from: (name: string) =>
      name === "profiles"
        ? table({ personalization_enabled: false, home_city: "delhi" })
        : table(null),
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  seenToolNames = [];
  runToolsImpl = () =>
    Promise.resolve({ text: "", usage: { inputTokens: 0, outputTokens: 0 }, steps: 1, stoppedAtStepCap: false });
});

describe("runMapSearch", () => {
  it("exposes only the reduced find/filter toolbox", async () => {
    const { runMapSearch } = await import("@/lib/chat/map-search");
    await runMapSearch(fakeSupabase(), { message: "rooftop", userId: "u1" });
    expect(seenToolNames.sort()).toEqual(["search_places", "show_on_map"]);
  });

  it("returns grounded slugs the agent chose to show", async () => {
    runToolsImpl = async ({ tools }: RunToolsRequest) => {
      const find = (n: string) => tools.find((t: AITool) => t.name === n)!;
      await find("search_places").handler({ query: "rooftop" });
      await find("show_on_map").handler({
        picks: [{ slug: "spot-1", reason: "Open-air, right hour" }],
      });
      return { text: "Rooftops.", usage: { inputTokens: 1, outputTokens: 1 }, steps: 2, stoppedAtStepCap: false };
    };
    const { runMapSearch } = await import("@/lib/chat/map-search");
    const result = await runMapSearch(fakeSupabase(), {
      message: "rooftop bar",
      userId: "u1",
    });
    expect(result.slugs).toEqual(["spot-1"]);
    expect(result.text).toBe("Rooftops.");
  });

  it("falls back to keyword slugs when the agent loop throws", async () => {
    runToolsImpl = () => Promise.reject(new Error("down"));
    const { runMapSearch } = await import("@/lib/chat/map-search");
    const result = await runMapSearch(fakeSupabase(), {
      message: "quiet cafe",
      userId: null,
    });
    expect(result.slugs).toEqual(["spot-1"]);
  });
});
