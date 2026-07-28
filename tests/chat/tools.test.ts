import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
// Market tools reach the store; stub it so the honesty branches test cleanly.
vi.mock("@/lib/market/store", () => ({
  resolveMarket: async () => null,
  marketIntelligenceByCategory: async () => new Map(),
  generateMarketRunPlan: async () => null,
}));
vi.mock("@/lib/market/report", () => ({
  recordMarketReport: async () => ({ outcome: "no_market", staged: 0 }),
}));
// The planner is a subsystem of its own; the chat tool contract under test is
// that its REAL stops flow back to the model (the grounding that stops plan
// replies being narrated from imagination).
const generateQuestMock = vi.fn();
vi.mock("@/lib/quests/generate", () => ({
  generateQuest: (...args: unknown[]) => generateQuestMock(...args),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildChatTools,
  ChatToolCollector,
  type ChatToolContext,
  type SurfacedPlace,
} from "@/lib/chat/tools";
import type { City } from "@/lib/cities";
import type { AITool } from "@/lib/ai/types";
import type { Database } from "@/types/database";

const CITY = {
  slug: "delhi",
  name: "Delhi",
  areas: ["Hauz Khas", "GK"],
} as unknown as City;

function makeCtx(over: Partial<ChatToolContext> = {}): ChatToolContext {
  return {
    supabase: {} as unknown as SupabaseClient<Database>,
    userId: "u1",
    city: CITY,
    personalize: true,
    tasteEmbedding: null,
    tasteSummary: "quiet, older places",
    learnedSignals: { top: "cafes" },
    ...over,
  };
}

function seed(collector: ChatToolCollector, place: SurfacedPlace) {
  collector.surfaced.set(place.slug, place);
}

function byName(tools: AITool[], name: string): AITool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not built`);
  return tool;
}

const PLACE: SurfacedPlace = {
  id: "p1",
  slug: "cafe-lota",
  name: "Cafe Lota",
  area: "GK",
  image_path: null,
};

describe("buildChatTools", () => {
  it("builds the full toolbox", () => {
    const tools = buildChatTools(makeCtx(), new ChatToolCollector());
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "build_market_run",
        "build_plan",
        "check_open_now",
        "get_market_intelligence",
        "get_place_details",
        "get_plan",
        "get_user_behavior",
        "log_market_report",
        "save_to_bucket",
        "search_places",
        "show_on_map",
      ].sort(),
    );
  });
});

describe("build_plan grounding", () => {
  const planResult = (over: Record<string, unknown> = {}) => ({
    questId: "q-1",
    title: "Slow Evening in GK",
    stops: 2,
    stopList: [
      { slug: "pizza-place", name: "Pizza Place", area: "GK", note: "Wood-fired base" },
      { slug: "dolce-bar", name: "Dolce Bar", area: "GK", note: "Tiramisu to finish" },
    ],
    areaOutcome: { requested: "GK", applied: "area", relaxed: false },
    ...over,
  });

  it("returns the plan's real stops and forbids id-talk, and passes the area through", async () => {
    generateQuestMock.mockResolvedValueOnce(planResult());
    const collector = new ChatToolCollector();
    const tools = buildChatTools(makeCtx(), collector);
    const out = String(
      await byName(tools, "build_plan").handler({
        brief: "pizza then tiramisu",
        area: "GK",
        budget_rupees: 4000,
      }),
    );

    // The model sees the actual stops - the raw material for an honest reply.
    expect(out).toContain("Pizza Place");
    expect(out).toContain("Tiramisu to finish");
    // ...but never the id; the app owns the View plan affordance.
    expect(out).not.toContain("q-1");
    expect(out).toContain("never mention a plan id");
    // Honored area -> no honesty note needed.
    expect(out).not.toContain("area_note");
    expect(collector.planId).toBe("q-1");
    // The stated area reached the planner instead of dying in prose.
    expect(generateQuestMock.mock.calls[0][2]).toMatchObject({ area: "GK" });
  });

  it("keeps this conversation's earlier places out of the next plan", async () => {
    generateQuestMock.mockResolvedValueOnce(planResult());
    const tools = buildChatTools(
      makeCtx({ shownEarlier: new Set(["olive-bar", "cafe-turtle"]) }),
      new ChatToolCollector(),
    );
    await byName(tools, "build_plan").handler({ brief: "pizza again" });
    expect(generateQuestMock.mock.calls.at(-1)![2]).toMatchObject({
      avoid_slugs: expect.arrayContaining(["olive-bar", "cafe-turtle"]),
    });
  });

  it("forces honesty when the asked area could not be honored", async () => {
    // The regression this pins: a "west delhi" ask filtered nothing, and the
    // reply confidently sold Khan Market stops as a West Delhi evening.
    generateQuestMock.mockResolvedValueOnce(
      planResult({
        areaOutcome: { requested: "west delhi", applied: "none", relaxed: false },
        stopList: [
          { slug: "cafe-turtle", name: "Cafe Turtle", area: "Khan Market", note: "n" },
          { slug: "khan-chacha", name: "Khan Chacha", area: "Khan Market", note: "n" },
        ],
      }),
    );
    const tools = buildChatTools(makeCtx(), new ChatToolCollector());
    const out = String(
      await byName(tools, "build_plan").handler({
        brief: "pizza and tiramisu",
        area: "west delhi",
      }),
    );
    expect(out).toContain("area_note");
    expect(out).toContain('couldn\'t fill this plan in \\"west delhi\\"');
    expect(out).toContain("Khan Market");
    expect(out).toContain('never label the plan with \\"west delhi\\"');
  });

  it("degrades honestly when the planner fails", async () => {
    generateQuestMock.mockRejectedValueOnce(new Error("catalog too thin"));
    const collector = new ChatToolCollector();
    const tools = buildChatTools(makeCtx(), collector);
    const out = String(
      await byName(tools, "build_plan").handler({ brief: "a day out" }),
    );
    expect(out).toContain("catalog too thin");
    expect(out).toContain("Be honest");
    expect(collector.planId).toBeNull();
  });
});

describe("get_plan grounding", () => {
  function planSupabase(opts: { quest?: unknown; stops?: unknown[] }) {
    const chain = (rows: unknown) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) c[m] = () => c;
      c.maybeSingle = () => Promise.resolve({ data: rows, error: null });
      c.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return c;
    };
    return {
      from: (name: string) =>
        name === "quests" ? chain(opts.quest ?? null) : chain(opts.stops ?? null),
    } as unknown as ChatToolContext["supabase"];
  }

  it("returns the saved plan's real stops in order", async () => {
    const supabase = planSupabase({
      quest: { id: "q-1", title: "Slow Evening in GK", city: "delhi" },
      stops: [
        { position: 1, note: "Start here", places: { name: "Pizza Place", area: "GK" } },
        { position: 2, note: "End sweet", places: { name: "Dolce Bar", area: "GK" } },
      ],
    });
    const tools = buildChatTools(makeCtx({ supabase }), new ChatToolCollector());
    const out = String(
      await byName(tools, "get_plan").handler({
        plan_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      }),
    );
    expect(out).toContain("Slow Evening in GK");
    expect(out).toContain("Pizza Place");
    expect(out).toContain("Dolce Bar");
    expect(out).toContain("from these stops only");
  });

  it("says not-found instead of inviting a memory-based description", async () => {
    const tools = buildChatTools(
      makeCtx({ supabase: planSupabase({}) }),
      new ChatToolCollector(),
    );
    const out = String(
      await byName(tools, "get_plan").handler({
        plan_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      }),
    );
    expect(out).toContain("No such plan");
    expect(out).toContain("rather than describing one from memory");
  });
});

describe("show_on_map grounding", () => {
  it("only shows slugs a search surfaced, and dedupes", async () => {
    const collector = new ChatToolCollector();
    seed(collector, PLACE);
    const tools = buildChatTools(makeCtx(), collector);
    const show = byName(tools, "show_on_map");

    const out = await show.handler({
      picks: [
        { slug: "cafe-lota", reason: "Quiet enough to read in" },
        { slug: "made-up", reason: "Invented" },
        { slug: "cafe-lota", reason: "Quiet enough to read in" },
      ],
    });
    expect(collector.shown).toEqual(["cafe-lota"]);
    expect(String(out)).toContain("made-up");
    expect(collector.shownPlaces()).toEqual([PLACE]);
  });

  it("rejects everything and asks for a search when nothing was surfaced", async () => {
    const collector = new ChatToolCollector();
    const tools = buildChatTools(makeCtx(), collector);
    const show = byName(tools, "show_on_map");
    const out = await show.handler({ picks: [{ slug: "ghost", reason: "x" }] });
    expect(collector.shown).toHaveLength(0);
    expect(String(out)).toContain("search_places");
  });

  it("records the model's per-pick reason for grounded slugs only", async () => {
    const collector = new ChatToolCollector();
    seed(collector, PLACE);
    const tools = buildChatTools(makeCtx(), collector);
    const show = byName(tools, "show_on_map");

    await show.handler({
      picks: [
        { slug: "cafe-lota", reason: "You wanted quiet - the back room stays hushed till noon" },
        { slug: "made-up", reason: "Should never land anywhere" },
      ],
    });
    expect(collector.reasons.get("cafe-lota")).toBe(
      "You wanted quiet - the back room stays hushed till noon",
    );
    // A hallucinated slug never gets a reason slot, let alone a card.
    expect(collector.reasons.has("made-up")).toBe(false);
  });

  it("leaves the reason slot empty when the model omits one, and says so", async () => {
    const collector = new ChatToolCollector();
    seed(collector, PLACE);
    const tools = buildChatTools(makeCtx(), collector);
    const show = byName(tools, "show_on_map");

    const out = await show.handler({ picks: [{ slug: "cafe-lota" }] });
    expect(collector.shown).toEqual(["cafe-lota"]);
    expect(collector.reasons.has("cafe-lota")).toBe(false);
    // The tool nudges the model that a missing reason means generic copy.
    expect(String(out)).toContain("Missing a reason");
  });

  it("normalizes em and en dashes in reasons to plain hyphens", async () => {
    const collector = new ChatToolCollector();
    seed(collector, PLACE);
    const tools = buildChatTools(makeCtx(), collector);
    const show = byName(tools, "show_on_map");

    await show.handler({
      picks: [{ slug: "cafe-lota", reason: "Late hours—quiet corners–good chai" }],
    });
    expect(collector.reasons.get("cafe-lota")).toBe(
      "Late hours - quiet corners - good chai",
    );
  });
});

describe("market tools honesty", () => {
  it("says a market is unmapped instead of inventing prices", async () => {
    const tools = buildChatTools(makeCtx(), new ChatToolCollector());
    const out = await byName(tools, "get_market_intelligence").handler({
      market: "Sarojini",
      category: "fashion",
    });
    expect(String(out)).toContain("mapped");
    expect(String(out)).not.toMatch(/₹\d/); // no fabricated number
  });

  it("won't build a shopping run for an unmapped market", async () => {
    const collector = new ChatToolCollector();
    const tools = buildChatTools(makeCtx(), collector);
    const out = await byName(tools, "build_market_run").handler({
      market: "Nowhere Bazaar",
      items: [{ category: "fashion" }],
    });
    expect(String(out)).toContain("mapped");
    expect(collector.marketRunId).toBeNull();
  });
});

describe("get_user_behavior consent", () => {
  it("stays out of behaviour when personalization is off", async () => {
    const tools = buildChatTools(makeCtx({ personalize: false }), new ChatToolCollector());
    const out = await byName(tools, "get_user_behavior").handler({});
    expect(String(out)).toContain("Personalization is off");
    expect(String(out)).not.toContain("quiet, older places");
  });

  it("returns taste + signals when personalization is on", async () => {
    const tools = buildChatTools(makeCtx(), new ChatToolCollector());
    const out = await byName(tools, "get_user_behavior").handler({});
    expect(String(out)).toContain("quiet, older places");
    // The explore/exploit dial rides along so the agent knows how far to stretch.
    expect(String(out)).toContain("posture");
  });

  it("sells itself as depth, not as the way to find out who this is", async () => {
    // With the profile in the prompt, a model that calls this to learn who it
    // is serving spends one of six steps re-fetching what it already has.
    const tools = buildChatTools(makeCtx(), new ChatToolCollector());
    const { description } = byName(tools, "get_user_behavior");
    expect(description).toContain("do NOT call this just to find out");
    expect(description).toContain("deeper read");
  });

  it("hands back readable signals, not JSON nested inside JSON", async () => {
    const tools = buildChatTools(
      makeCtx({ learnedSignals: { top_vibes: [{ tag: "chai", score: 4 }] } }),
      new ChatToolCollector(),
    );
    const out = String(await byName(tools, "get_user_behavior").handler({}));

    // Double-encoding handed the model an escape-littered string to read
    // through; the object should survive one parse.
    expect(out).not.toContain('\\"');
    const parsed = JSON.parse(out) as { learned_signals: unknown };
    expect(parsed.learned_signals).toEqual({
      top_vibes: [{ tag: "chai", score: 4 }],
    });
  });
});
