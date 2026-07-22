import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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
        "build_plan",
        "check_open_now",
        "get_market_intelligence",
        "get_place_details",
        "get_user_behavior",
        "save_to_bucket",
        "search_places",
        "show_on_map",
      ].sort(),
    );
  });
});

describe("show_on_map grounding", () => {
  it("only shows slugs a search surfaced, and dedupes", async () => {
    const collector = new ChatToolCollector();
    seed(collector, PLACE);
    const tools = buildChatTools(makeCtx(), collector);
    const show = byName(tools, "show_on_map");

    const out = await show.handler({ slugs: ["cafe-lota", "made-up", "cafe-lota"] });
    expect(collector.shown).toEqual(["cafe-lota"]);
    expect(String(out)).toContain("made-up");
    expect(collector.shownPlaces()).toEqual([PLACE]);
  });

  it("rejects everything and asks for a search when nothing was surfaced", async () => {
    const collector = new ChatToolCollector();
    const tools = buildChatTools(makeCtx(), collector);
    const show = byName(tools, "show_on_map");
    const out = await show.handler({ slugs: ["ghost"] });
    expect(collector.shown).toHaveLength(0);
    expect(String(out)).toContain("search_places");
  });
});

describe("get_market_intelligence honesty", () => {
  it("refuses to fabricate and points at build_plan", async () => {
    const tools = buildChatTools(makeCtx(), new ChatToolCollector());
    const out = await byName(tools, "get_market_intelligence").handler({});
    expect(String(out)).toContain("isn't available yet");
    expect(String(out)).toContain("build_plan");
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
});
