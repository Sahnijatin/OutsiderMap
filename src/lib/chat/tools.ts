import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getEmbeddings } from "@/lib/ai";
import { defineTool } from "@/lib/ai/tool-loop";
import type { AITool } from "@/lib/ai/types";
import { deriveAdventurousness } from "@/lib/chat/adventurousness";
import { effectiveTier } from "@/lib/chat/budget";
import {
  keywordSearch,
  preferOpen,
  searchCatalog,
  type CatalogCandidate,
} from "@/lib/catalog/search";
import { openStatusLabel } from "@/lib/places/hours";
import { generateQuest } from "@/lib/quests/generate";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateMarketRunPlan,
  marketIntelligenceByCategory,
  resolveMarket,
} from "@/lib/market/store";
import { recordMarketReport } from "@/lib/market/report";
import { intelligenceLine, planToModelPayload } from "@/lib/market/present";
import type { City } from "@/lib/cities";
import type { Database, Json } from "@/types/database";

/**
 * The chat agent's toolbox (#95). Each tool wraps an existing subsystem
 * (catalog search, the quest/planner engine, behaviour signals, save/map
 * actions) behind a provider-agnostic {@link AITool}. Tools return short text
 * for the model; anything the UI needs (which places to render, map/save
 * actions) and a debug trace are written to a {@link ChatToolCollector} as they
 * run, since the agent loop itself only returns final text.
 *
 * Grounding is enforced here, not hoped for: `show_on_map` / `save_to_bucket`
 * only accept slugs a search actually surfaced, so the agent can't render a
 * place it invented.
 */

export interface ChatToolContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  city: City;
  /** Consent-gated personalization. When false, taste/behaviour stay out. */
  personalize: boolean;
  tasteEmbedding: number[] | null;
  tasteSummary: string | null;
  learnedSignals: Json | null;
}

/** A place a search surfaced, kept for grounding and final rendering. */
export interface SurfacedPlace {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  image_path: string | null;
}

export interface AgentTraceEntry {
  tool: string;
  summary: string;
}

/**
 * Mutable sink the tools write into. The loop returns only text; the UI payload
 * (places to show, save actions, any built plan) and the trace accrue here.
 */
export class ChatToolCollector {
  /** Every place any search surfaced this turn, by slug - the grounding set. */
  readonly surfaced = new Map<string, SurfacedPlace>();
  /** Slugs the agent explicitly chose to show, in order, deduped. */
  readonly shown: string[] = [];
  readonly saved = new Set<string>();
  /** Quest id if the agent built a plan this turn. */
  planId: string | null = null;
  planTitle: string | null = null;
  /** market_run id if the agent built a shopping run this turn. */
  marketRunId: string | null = null;
  readonly trace: AgentTraceEntry[] = [];

  /** Places to render as cards: what the agent showed, else empty. */
  shownPlaces(): SurfacedPlace[] {
    return this.shown
      .map((slug) => this.surfaced.get(slug))
      .filter((p): p is SurfacedPlace => Boolean(p));
  }
}

function compactCandidate(c: CatalogCandidate) {
  return {
    slug: c.slug,
    name: c.name,
    area: c.area,
    category: c.category,
    price: c.price_level,
    vibes: c.vibe_tags,
    about: c.description,
    editor_note: c.editor_note,
    open: c.open === null ? "unknown" : c.open,
  };
}

const SearchInput = z.object({
  query: z
    .string()
    .min(1)
    .describe("What to look for, in the user's words: mood, craving, vibe."),
  area: z
    .string()
    .nullish()
    .describe("Neighbourhood to focus on, if the user named one."),
  budget_max: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullish()
    .describe("Price tier ceiling 1-4, if implied ('broke', 'fancy')."),
  budget_rupees: z
    .number()
    .positive()
    .nullish()
    .describe(
      "Per-head rupee budget if the user gave a number (e.g. 200 for '200 mein dinner'). Mapped to a price tier.",
    ),
});

const SlugInput = z.object({
  slug: z.string().min(1).describe("Catalog slug from a prior search, verbatim."),
});

/**
 * Builds the toolbox bound to one turn's context + collector. Tools that reach
 * external services (search embeddings, the planner) degrade to an honest
 * message rather than throwing, so a subsystem blip never sinks the turn.
 */
export function buildChatTools(
  ctx: ChatToolContext,
  collector: ChatToolCollector,
): AITool[] {
  const search_places = defineTool({
    name: "search_places",
    description:
      "Search the OutsiderMap catalog for real places matching a query (mood / craving / vibe), optionally filtered by neighbourhood and price tier. Returns catalog places only - never invent places. Call this before recommending anything.",
    inputSchema: SearchInput,
    handler: async (input) => {
      const budgetMax = effectiveTier(input.budget_max, input.budget_rupees);
      let candidates: CatalogCandidate[];
      try {
        const [embedding] = await getEmbeddings().embed([input.query]);
        candidates = await searchCatalog(ctx.supabase, {
          city: ctx.city,
          queryEmbedding: embedding,
          tasteEmbedding: ctx.personalize ? ctx.tasteEmbedding : null,
          area: input.area ?? null,
          budgetMax,
        });
      } catch {
        // Embeddings provider blip - fall back to keyword retrieval.
        candidates = await keywordSearch(ctx.supabase, {
          city: ctx.city,
          terms: [input.query],
          area: input.area ?? null,
          budgetMax,
        });
      }
      const pool = preferOpen(candidates).slice(0, 12);
      for (const c of pool) {
        collector.surfaced.set(c.slug, {
          id: c.id,
          slug: c.slug,
          name: c.name,
          area: c.area,
          image_path: c.image_path,
        });
      }
      collector.trace.push({
        tool: "search_places",
        summary: `"${input.query}" -> ${pool.length} places`,
      });
      if (pool.length === 0) {
        return "No catalog places match that. Tell the user honestly; do not invent places.";
      }
      return JSON.stringify(pool.map(compactCandidate));
    },
  });

  const get_place_details = defineTool({
    name: "get_place_details",
    description:
      "Look up full details for one catalog place by slug (category, price, vibes, editor note, hours).",
    inputSchema: SlugInput,
    handler: async (input) => {
      const { data } = await ctx.supabase
        .from("places")
        .select(
          "slug, name, area, category, price_level, vibe_tags, description, editor_note, hours",
        )
        .eq("slug", input.slug)
        .eq("city", ctx.city.slug)
        .maybeSingle();
      collector.trace.push({
        tool: "get_place_details",
        summary: data ? input.slug : `${input.slug} (not found)`,
      });
      if (!data) return `No catalog place with slug "${input.slug}".`;
      return JSON.stringify({
        slug: data.slug,
        name: data.name,
        area: data.area,
        category: data.category,
        price: data.price_level,
        vibes: data.vibe_tags,
        about: data.description,
        editor_note: data.editor_note,
        open: openStatusLabel(data.hours ?? null),
      });
    },
  });

  const check_open_now = defineTool({
    name: "check_open_now",
    description: "Check whether one place is open right now (IST).",
    inputSchema: SlugInput,
    handler: async (input) => {
      const { data } = await ctx.supabase
        .from("places")
        .select("hours")
        .eq("slug", input.slug)
        .eq("city", ctx.city.slug)
        .maybeSingle();
      collector.trace.push({ tool: "check_open_now", summary: input.slug });
      if (!data) return `No catalog place with slug "${input.slug}".`;
      return openStatusLabel(data.hours ?? null) ?? "hours unknown";
    },
  });

  const get_user_behavior = defineTool({
    name: "get_user_behavior",
    description:
      "Read what this person's past behaviour says about their taste (learned signals + taste summary) and the explore/exploit dial telling you how far to stretch them vs. play it safe. Use it to personalize. Returns nothing personal when personalization is off.",
    inputSchema: z.object({}),
    handler: () => {
      if (!ctx.personalize) {
        collector.trace.push({ tool: "get_user_behavior", summary: "off" });
        return "Personalization is off for this user - recommend from the ask alone, don't reference past behaviour.";
      }
      const dial = deriveAdventurousness(ctx.learnedSignals);
      collector.trace.push({
        tool: "get_user_behavior",
        summary: `posture=${dial.posture}`,
      });
      const signals =
        ctx.learnedSignals && typeof ctx.learnedSignals === "object"
          ? JSON.stringify(ctx.learnedSignals)
          : "none yet";
      return JSON.stringify({
        taste_summary: ctx.tasteSummary ?? "none yet",
        learned_signals: signals,
        adventurousness: {
          posture: dial.posture,
          score: dial.score,
          guidance: dial.guidance,
        },
      });
    },
  });

  const BuildPlanInput = z.object({
    brief: z
      .string()
      .min(1)
      .describe(
        "The multi-stop / shopping / day-plan ask in the user's words (e.g. 'spicy dinner then dessert nearby', 'shopping run: tops, jeans, shoes').",
      ),
    interests: z.array(z.string()).max(6).nullish(),
    hours: z.number().int().min(2).max(12).nullish(),
    budget_max: z.number().int().min(1).max(4).nullish(),
    budget_rupees: z
      .number()
      .positive()
      .nullish()
      .describe("Per-head rupee budget if given; mapped to a price tier."),
  });

  const build_plan = defineTool({
    name: "build_plan",
    description:
      "Build a trackable multi-stop plan via the Planner - for shopping runs, 'dinner then dessert', or day plans. Returns a plan id and title. Use this instead of listing places when the ask is a sequence or a run of errands.",
    inputSchema: BuildPlanInput,
    handler: async (input) => {
      try {
        const result = await generateQuest(ctx.supabase, ctx.userId, {
          brief: input.brief,
          interests: input.interests ?? [],
          hours: input.hours ?? 5,
          budget_max:
            effectiveTier(input.budget_max, input.budget_rupees) ?? undefined,
          city: ctx.city.slug,
          first_time: false,
        });
        collector.planId = result.questId;
        collector.planTitle = result.title;
        collector.trace.push({
          tool: "build_plan",
          summary: `"${result.title}" (${result.stops} stops)`,
        });
        return JSON.stringify({
          plan_id: result.questId,
          title: result.title,
          stops: result.stops,
          note: "Plan built and saved. Tell the user its title and that it's trackable.",
        });
      } catch (error) {
        collector.trace.push({
          tool: "build_plan",
          summary: `failed: ${error instanceof Error ? error.message : "error"}`,
        });
        return `Could not build a plan: ${
          error instanceof Error ? error.message : "unknown error"
        }. Be honest with the user rather than inventing a plan.`;
      }
    },
  });

  const get_market_intelligence = defineTool({
    name: "get_market_intelligence",
    description:
      "Get honest shopping price intelligence for a market + category (e.g. 'Sarojini', 'fashion') before answering a 'what will X cost at Y' ask. Returns an aggregated price band or an honest 'not enough data' - never a single exact price. Do not fabricate prices or shops.",
    inputSchema: z.object({
      market: z.string().min(1).describe("Market name or slug, e.g. 'Sarojini'."),
      category: z
        .string()
        .min(1)
        .describe("Item category, e.g. 'fashion', 'ethnic wear', 'shoes'."),
    }),
    handler: async (input) => {
      try {
        const admin = createAdminClient();
        const market = await resolveMarket(admin, ctx.city.slug, input.market);
        if (!market) {
          collector.trace.push({
            tool: "get_market_intelligence",
            summary: `${input.market} (unmapped)`,
          });
          return `We don't have "${input.market}" mapped in ${ctx.city.name} yet. Say so honestly; don't invent prices or shops.`;
        }
        const intel = await marketIntelligenceByCategory(admin, market.id, [
          input.category,
        ]);
        const result = intel.get(input.category)!;
        collector.trace.push({
          tool: "get_market_intelligence",
          summary: `${market.slug}/${input.category} -> ${result.basis}`,
        });
        return intelligenceLine(market.name, input.category, result);
      } catch (error) {
        collector.trace.push({
          tool: "get_market_intelligence",
          summary: `failed: ${error instanceof Error ? error.message : "error"}`,
        });
        return "Couldn't reach market intelligence just now - don't fabricate prices; tell the user to ask around.";
      }
    },
  });

  const BuildMarketRunInput = z.object({
    market: z
      .string()
      .min(1)
      .describe("Which market they're going to, name or slug (e.g. 'Sarojini')."),
    items: z
      .array(
        z.object({
          category: z
            .string()
            .min(1)
            .describe("Category to buy, e.g. 'fashion', 'jeans', 'ethnic wear'."),
          item: z.string().nullish().describe("Specific item if named."),
        }),
      )
      .min(1)
      .max(12)
      .describe("What they want to buy this trip."),
    budget_rupees: z
      .number()
      .positive()
      .nullish()
      .describe("Total per-head rupee budget for the trip, if given."),
  });

  const build_market_run = defineTool({
    name: "build_market_run",
    description:
      "Build a trackable shopping game-plan for a real market ('going Sarojini tomorrow for a jacket + cargos, ₹3k'): the lanes to hit, honest per-item price bands, bargaining notes, and whether the budget fits. Use this for market/shopping runs instead of build_plan. Returns bands, never exact prices.",
    inputSchema: BuildMarketRunInput,
    handler: async (input) => {
      try {
        const admin = createAdminClient();
        const market = await resolveMarket(admin, ctx.city.slug, input.market);
        if (!market) {
          collector.trace.push({
            tool: "build_market_run",
            summary: `${input.market} (unmapped)`,
          });
          return `We don't have "${input.market}" mapped in ${ctx.city.name} yet - don't invent a shopping plan. Offer to route real catalog stops with build_plan instead.`;
        }
        const items = input.items.map((i) => ({
          category: i.category,
          item: i.item ?? null,
        }));
        const plan = await generateMarketRunPlan(admin, {
          marketSlug: market.slug,
          items,
          budgetMax: input.budget_rupees ?? null,
        });
        if (!plan) {
          return `Couldn't build a plan for ${market.name} right now. Be honest rather than inventing one.`;
        }

        // Persist as the owner (RLS-scoped) so the run is trackable + feeds the
        // completion loop later. The plan snapshot holds aggregates only.
        const { data: run } = await ctx.supabase
          .from("market_runs")
          .insert({
            user_id: ctx.userId,
            market_id: market.id,
            city: ctx.city.slug,
            budget_max: input.budget_rupees ?? null,
            items: items as unknown as Json,
            // Store the clean domain plan (the view reads this); the model gets
            // the payload form below.
            plan: plan as unknown as Json,
            status: "active",
          })
          .select("id")
          .single();

        collector.marketRunId = run?.id ?? null;
        collector.trace.push({
          tool: "build_market_run",
          summary: `${market.slug} (${plan.stops.length} lanes, ${plan.budgetVerdict})`,
        });
        return JSON.stringify(planToModelPayload(plan));
      } catch (error) {
        collector.trace.push({
          tool: "build_market_run",
          summary: `failed: ${error instanceof Error ? error.message : "error"}`,
        });
        return `Could not build a market run: ${
          error instanceof Error ? error.message : "unknown error"
        }. Be honest rather than inventing prices or shops.`;
      }
    },
  });

  const LogMarketReportInput = z.object({
    market: z
      .string()
      .min(1)
      .describe("Which market they shopped, name or slug (e.g. 'Sarojini')."),
    purchases: z
      .array(
        z.object({
          category: z
            .string()
            .min(1)
            .describe("What they bought, e.g. 'fashion', 'jeans', 'juttis'."),
          item: z.string().nullish().describe("Specific item if named."),
          price: z.number().positive().describe("Rupees they actually paid."),
        }),
      )
      .min(1)
      .max(12)
      .describe("What they bought and paid, from what they just told you."),
    run_id: z
      .string()
      .nullish()
      .describe("The market_run id this trip came from, if this turn built one."),
  });

  const log_market_report = defineTool({
    name: "log_market_report",
    description:
      "Record what the user actually bought and paid at a market when they tell you post-trip ('got the jacket for 600 at Sarojini'). Feeds honest prices back so the next person's plan is better. Only log real prices the user stated - never invent them.",
    inputSchema: LogMarketReportInput,
    handler: async (input) => {
      try {
        const admin = createAdminClient();
        const result = await recordMarketReport(admin, ctx.supabase, {
          userId: ctx.userId,
          citySlug: ctx.city.slug,
          market: input.market,
          lines: input.purchases.map((p) => ({
            category: p.category,
            item: p.item ?? null,
            price: p.price,
          })),
          runId: input.run_id ?? null,
        });
        collector.trace.push({
          tool: "log_market_report",
          summary: `${input.market} -> ${result.outcome} (${result.staged})`,
        });
        if (result.outcome === "no_market") {
          return `We don't have "${input.market}" mapped yet, so I can't file that. Thank them anyway; don't invent a record.`;
        }
        if (result.outcome === "no_prices") {
          return "No usable prices in that report - ask them what they paid, don't make one up.";
        }
        return `Logged ${result.staged} price(s) from ${result.marketName}. Thank them warmly - their report helps the next person's plan (it's reviewed before it counts).`;
      } catch (error) {
        collector.trace.push({
          tool: "log_market_report",
          summary: `failed: ${error instanceof Error ? error.message : "error"}`,
        });
        return "Couldn't save that report just now - thank them and move on; don't fabricate a confirmation.";
      }
    },
  });

  const ShowOnMapInput = z.object({
    slugs: z
      .array(z.string().min(1))
      .min(1)
      .max(6)
      .describe("Slugs from prior search results to render as cards / on the map."),
  });

  const show_on_map = defineTool({
    name: "show_on_map",
    description:
      "Render these places as cards and pins for the user. Only pass slugs that came back from search_places - this is how the user actually sees your picks.",
    inputSchema: ShowOnMapInput,
    handler: (input) => {
      const accepted: string[] = [];
      const rejected: string[] = [];
      for (const slug of input.slugs) {
        if (collector.surfaced.has(slug)) {
          if (!collector.shown.includes(slug)) collector.shown.push(slug);
          accepted.push(slug);
        } else {
          rejected.push(slug);
        }
      }
      collector.trace.push({
        tool: "show_on_map",
        summary: `${accepted.length} shown${
          rejected.length ? `, ${rejected.length} rejected` : ""
        }`,
      });
      if (accepted.length === 0) {
        return `None of those slugs came from a search - I can only show real catalog places. Rejected: ${rejected.join(
          ", ",
        )}. Run search_places first.`;
      }
      return rejected.length
        ? `Showing ${accepted.length}. Ignored unknown slugs: ${rejected.join(", ")}.`
        : `Showing ${accepted.length} place(s) to the user.`;
    },
  });

  const save_to_bucket = defineTool({
    name: "save_to_bucket",
    description:
      "Save a place to the user's list (want-to-go) when they ask to save/bookmark it.",
    inputSchema: SlugInput,
    handler: async (input) => {
      const surfaced = collector.surfaced.get(input.slug);
      let placeId = surfaced?.id ?? null;
      if (!placeId) {
        const { data } = await ctx.supabase
          .from("places")
          .select("id")
          .eq("slug", input.slug)
          .eq("city", ctx.city.slug)
          .maybeSingle();
        placeId = data?.id ?? null;
      }
      if (!placeId) {
        return `No catalog place with slug "${input.slug}" - can't save what doesn't exist.`;
      }
      const { error } = await ctx.supabase
        .from("saved_places")
        .upsert(
          { user_id: ctx.userId, place_id: placeId, status: "saved" },
          { onConflict: "user_id,place_id" },
        );
      if (error) return `Could not save: ${error.message}.`;
      await ctx.supabase.from("interaction_events").insert({
        user_id: ctx.userId,
        place_id: placeId,
        event_type: "save",
        payload: { source: "chat" } as Json,
      });
      collector.saved.add(input.slug);
      collector.trace.push({ tool: "save_to_bucket", summary: input.slug });
      return `Saved "${input.slug}" to their list.`;
    },
  });

  return [
    search_places,
    get_place_details,
    check_open_now,
    get_user_behavior,
    build_plan,
    get_market_intelligence,
    build_market_run,
    log_market_report,
    show_on_map,
    save_to_bucket,
  ];
}
