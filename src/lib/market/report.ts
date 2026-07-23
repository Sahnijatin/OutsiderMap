import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { resolveMarket } from "./store";

/**
 * The completion loop (#68): after a market run, the member reports what they
 * actually paid. Each report is a first-party price observation - the freshest,
 * highest-trust source - so it feeds the same aggregation everyone else's plan
 * reads from, and the loop gets visibly smarter.
 *
 * Two guardrails, both fraud-first (shops WILL try to game prices):
 *  - reports land as `pending` and shopless. A single report can't move a band
 *    (the aggregator needs corroboration) and can never name a shop; publishing
 *    is a moderated step (admin surface / trusted-user auto-publish is a #70/#80
 *    follow-up).
 *  - the contribution is logged to interaction_events as `market_report`;
 *    durable scout credit / points is #80's ledger, not invented here.
 */

/** One "I bought X here for ₹Y" line from a member. */
export interface MarketReportLine {
  category: string;
  item?: string | null;
  price: number;
}

/** First-party reports carry solid base trust; recency is now (they just went). */
const USER_REPORT_CONFIDENCE = 0.6;

type PricePointInsert = Database["public"]["Tables"]["price_points"]["Insert"];

/**
 * Map a member's report line to a pending price_points row (pure). Always
 * user_report, pending, and shopless; observed now. Returns null for a line
 * without a usable positive price.
 */
export function reportToPricePoint(
  line: MarketReportLine,
  ctx: { marketId: string; userId: string; now: Date },
): PricePointInsert | null {
  if (!Number.isFinite(line.price) || line.price <= 0) return null;
  return {
    market_id: ctx.marketId,
    shop_id: null,
    category: line.category,
    item: line.item ?? null,
    price: Math.round(line.price),
    currency: "INR",
    source: "user_report",
    source_ref: `report:${ctx.userId}`,
    confidence: USER_REPORT_CONFIDENCE,
    status: "pending",
    observed_at: ctx.now.toISOString(),
  };
}

export interface MarketReportResult {
  outcome: "recorded" | "no_market" | "no_prices";
  marketName?: string;
  staged: number;
}

/**
 * Record a member's post-trip report: stage pending user_report price points,
 * log the contribution, and mark a linked run complete. Reads/writes to
 * price_points go through the admin client (RLS keeps it server-only); the
 * contribution + run update are written as the member.
 */
export async function recordMarketReport(
  admin: SupabaseClient<Database>,
  member: SupabaseClient<Database>,
  input: {
    userId: string;
    citySlug: string;
    market: string;
    lines: MarketReportLine[];
    runId?: string | null;
    now?: Date;
  },
): Promise<MarketReportResult> {
  const now = input.now ?? new Date();
  const market = await resolveMarket(admin, input.citySlug, input.market);
  if (!market) return { outcome: "no_market", staged: 0 };

  const rows = input.lines
    .map((line) => reportToPricePoint(line, { marketId: market.id, userId: input.userId, now }))
    .filter((r): r is PricePointInsert => r !== null);
  if (rows.length === 0) {
    return { outcome: "no_prices", marketName: market.name, staged: 0 };
  }

  const { error } = await admin.from("price_points").insert(rows);
  if (error) throw new Error(error.message);

  // Feed the learning loop, and close a linked run. Best-effort: the report is
  // already staged, so a logging blip shouldn't fail the member's turn.
  await member.from("interaction_events").insert({
    user_id: input.userId,
    event_type: "market_report",
    payload: {
      source: "market_report",
      market: market.slug,
      lines: rows.length,
      run_id: input.runId ?? null,
    } as Json,
  });
  if (input.runId) {
    await member
      .from("market_runs")
      .update({ status: "completed" })
      .eq("id", input.runId)
      .eq("user_id", input.userId);
  }

  return { outcome: "recorded", marketName: market.name, staged: rows.length };
}
