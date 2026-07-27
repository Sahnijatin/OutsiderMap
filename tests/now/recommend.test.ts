import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * The symmetric failure posture (#REVIEW 4.3): when the AI pipeline is down
 * (no OPENAI_API_KEY, provider outage), recommend() must degrade to the same
 * honest keyword fallback chat uses - flagged degraded, never a 500 - so
 * /api/now and the activation reveal stay up without keys.
 */

vi.mock("server-only", () => ({}));

// Not exercised (tests pass a client), but the module imports it at top level.
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.reject(new Error("unused in tests")),
}));

let aiDown: boolean;

vi.mock("@/lib/ai", () => ({
  getAI: () => {
    if (aiDown) throw new Error("Missing ANTHROPIC_API_KEY");
    return {
      extract: () => Promise.reject(new Error("provider down")),
    };
  },
  getEmbeddings: () => ({
    embed: () => Promise.reject(new Error("Embeddings require OPENAI_API_KEY to be set")),
  }),
}));

const CANDIDATE = {
  id: "p1",
  slug: "spot-1",
  name: "Spot One",
  area: "GK",
  category: null,
  price_level: null,
  vibe_tags: [],
  description: null,
  editor_note: "The upstairs corner is the move",
  similarity: 0,
  hours: null,
  image_path: null,
  open: true,
  openLabel: null,
};

vi.mock("@/lib/catalog/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/catalog/search")>();
  return {
    ...original,
    searchCatalog: () => Promise.reject(new Error("no embedding, no match")),
    keywordSearch: () => Promise.resolve([CANDIDATE]),
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
    for (const m of ["select", "eq", "gte", "lte", "order", "limit", "in"]) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = () => Promise.resolve({ data: rows, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
    return chain;
  };
  return {
    from: (name: string) => {
      if (name === "profiles") {
        return table({ personalization_enabled: true, home_city: "delhi" });
      }
      if (name === "events") return table([]);
      return table(null);
    },
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => {
  aiDown = true;
  vi.resetModules();
});

describe("recommend degraded posture", () => {
  it("degrades to flagged keyword picks instead of throwing when the provider is unconfigured", async () => {
    const { recommend } = await import("@/lib/now/recommend");
    const result = await recommend("u1", "something crispy", fakeSupabase());

    expect(result.degraded).toBe(true);
    expect(result.picks.map((p) => p.place.slug)).toEqual(["spot-1"]);
    // Honest reasons only: the static editor note, never an invented "for you".
    expect(result.picks[0].reason).toBe("The upstairs corner is the move");
    // A neutral intent - nothing was read into the ask.
    expect(result.intent.mood).toBeNull();
    expect(result.intent.wants).toEqual([]);
  });

  it("degrades (not throws) when intent extraction fails mid-pipeline", async () => {
    aiDown = false; // getAI works, but extract rejects (provider outage)
    const { recommend } = await import("@/lib/now/recommend");
    const result = await recommend("u1", "quiet corner", fakeSupabase());

    expect(result.degraded).toBe(true);
    expect(result.picks.map((p) => p.place.slug)).toEqual(["spot-1"]);
  });
});
