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

function fakeSupabase(
  opts: { personalize?: boolean; taste?: unknown; queried?: string[] } = {},
) {
  const table = (rows: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "not"])
      chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: rows, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
    return chain;
  };
  return {
    from: (name: string) => {
      opts.queried?.push(name);
      if (name === "profiles") {
        return table({
          personalization_enabled: opts.personalize ?? false,
          home_city: "delhi",
          display_name: "Ira",
        });
      }
      if (name === "taste_profiles") return table(opts.taste ?? null);
      return table(null);
    },
  } as unknown as SupabaseClient<Database>;
}

const TASTE = {
  taste_summary: "You go out to be alone in public.",
  embedding: null,
  learned_signals: {
    event_count: 51,
    top_vibes: [
      { tag: "study-spot", score: 30 },
      { tag: "books", score: 22 },
    ],
    avoid_vibes: [{ tag: "loud-music", score: -9 }],
    top_areas: ["Khan Market"],
    active_hours: { morning: 20, afternoon: 25, evening: 3, late_night: 0 },
  },
  quiz_answers: {
    dimensions: { anchors: ["reads for three hours and orders once"] },
  },
};

/** Runs a search and returns the system prompt the model was handed. */
async function systemPromptFor(supabase: SupabaseClient<Database>) {
  let system = "";
  runToolsImpl = async ({ messages }: RunToolsRequest) => {
    system = String(messages.find((m) => m.role === "system")?.content ?? "");
    return { text: "", usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, stoppedAtStepCap: false };
  };
  const { runMapSearch } = await import("@/lib/chat/map-search");
  await runMapSearch(supabase, { message: "quiet place", userId: "u1" });
  return system;
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

/**
 * Map search was the one surface with no notion of who was searching: it loaded
 * the taste embedding, hardcoded `learnedSignals: null`, and its prompt said
 * nothing about the member at all.
 */
describe("runMapSearch - taste in the ranking", () => {
  it("gives the model the member's vocabulary to sort by", async () => {
    const system = await systemPromptFor(
      fakeSupabase({ personalize: true, taste: TASTE }),
    );
    expect(system).toContain("study-spot");
    expect(system).toContain("Khan Market");
    expect(system).toContain("never mention it");
  });

  it("stays a one-liner - no anchors, no summary, no reason coaching", async () => {
    // This surface ranks pins and writes one line. Everything chat needs to
    // write a good per-pick reason is dead weight here.
    const system = await systemPromptFor(
      fakeSupabase({ personalize: true, taste: TASTE }),
    );
    expect(system).not.toContain("reads for three hours");
    expect(system).not.toContain("You go out to be alone in public");
    expect(system).not.toContain("<member_profile>");
    expect(system).not.toContain("Wrong:");
  });

  it("does not read the member's history it would never use", async () => {
    // Two queries for place names this surface has no way to say would be
    // latency spent on nothing.
    const queried: string[] = [];
    await systemPromptFor(
      fakeSupabase({ personalize: true, taste: TASTE, queried }),
    );
    expect(queried).not.toContain("saved_places");
    expect(queried).not.toContain("interaction_events");
  });

  it("says nothing personal when the member opted out", async () => {
    const system = await systemPromptFor(
      fakeSupabase({ personalize: false, taste: TASTE }),
    );
    expect(system).not.toContain("study-spot");
    expect(system).not.toContain("Khan Market");
  });

  it("is unchanged for a member with no taste profile", async () => {
    const withProfile = await systemPromptFor(fakeSupabase({ personalize: true }));
    expect(withProfile).not.toContain("This member's taste runs to");
  });
});
