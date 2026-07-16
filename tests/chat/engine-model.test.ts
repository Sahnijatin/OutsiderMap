import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * The picks composition must run on the fast model (issue #38) - the heavy
 * default was the main source of chat timeouts. We fake the AI provider and
 * a minimal supabase client, then assert every extract call in a recommend
 * turn carries a model override.
 */

const extractCalls: Array<{ schemaName: string; model?: string }> = [];

// serverEnv() validates the public Supabase vars even though this test never
// touches Supabase - satisfy it with stubs.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({
  getAI: () => ({
    name: "anthropic",
    extract: (req: { schemaName: string; model?: string }) => {
      extractCalls.push({ schemaName: req.schemaName, model: req.model });
      if (req.schemaName === "chat_decision") {
        return Promise.resolve({
          action: "recommend",
          question: null,
          intent: {
            mood: null,
            craving: "crispy",
            energy: null,
            budget_max: null,
            area: null,
            company: null,
            wants: [],
            avoid: [],
          },
          search_query: "crispy street food",
        });
      }
      return Promise.resolve({
        lead_in: "Here you go.",
        picks: [{ slug: "spot-1", reason: "fits" }],
      });
    },
  }),
  getEmbeddings: () => ({
    embed: () => Promise.resolve([[0.1, 0.2]]),
  }),
}));
vi.mock("@/lib/catalog/search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/catalog/search")>();
  return {
    ...original,
    searchCatalog: () =>
      Promise.resolve([
        {
          id: "p1",
          slug: "spot-1",
          name: "Spot One",
          area: null,
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
        },
      ]),
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
      areas: [],
      created_at: "",
    }),
}));

function fakeSupabase() {
  const table = (rows: unknown) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of [
      "select",
      "eq",
      "order",
      "limit",
      "in",
      "update",
      "insert",
    ]) {
      chain[m] = (..._a: unknown[]) => {
        void _a;
        return chain;
      };
    }
    chain.maybeSingle = () => Promise.resolve({ data: rows, error: null });
    chain.single = () => Promise.resolve({ data: rows, error: null });
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
    void self;
    return chain;
  };
  return {
    from: (name: string) => {
      if (name === "profiles") {
        return table({ personalization_enabled: true, home_city: "delhi" });
      }
      if (name === "chat_threads") return table({ id: "t-1" });
      if (name === "places") return table([]);
      return table(null);
    },
  } as unknown as SupabaseClient<Database>;
}

describe("chat engine model selection", () => {
  it("uses a fast model for BOTH decision and picks extracts", async () => {
    const { runChatTurn } = await import("@/lib/chat/engine");
    extractCalls.length = 0;
    await runChatTurn(fakeSupabase(), "user-1", { message: "crispy please" });

    const decision = extractCalls.find((c) => c.schemaName === "chat_decision");
    const picks = extractCalls.find((c) => c.schemaName === "chat_picks");
    expect(decision?.model).toBeTruthy();
    expect(picks?.model).toBeTruthy();
    expect(picks?.model).toBe(decision?.model);
  });
});
