import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { aggregate } from "./intelligence";
import { buildMarketRunPlan } from "./plan";
import type {
  Market,
  MarketGuide,
  MarketIntelligence,
  MarketRunPlan,
  MarketSection,
  PricePoint,
  RequestedItem,
} from "./types";

/**
 * Server-only bindings between the market_intel store and the pure engines.
 * The one rule this file guards: raw price_points rows never leave here - only
 * the aggregate does. Reads use the service-role client (RLS keeps
 * price_points unreadable to any member), so pass an admin client.
 */

type PricePointRow = Database["public"]["Tables"]["price_points"]["Row"];

/** Map a stored row to a domain PricePoint; drops rows without a usable price. */
export function rowToPricePoint(row: PricePointRow): PricePoint | null {
  if (row.price == null) return null;
  return {
    price: row.price,
    source: row.source,
    confidence: row.confidence,
    observedAt: row.observed_at ? new Date(row.observed_at) : null,
    shopId: row.shop_id,
  };
}

export interface MarketContext {
  market: Market;
  sections: MarketSection[];
  guides: MarketGuide[];
}

/** Load a published market with its lanes and authored playbook, or null. */
export async function loadMarketContext(
  admin: SupabaseClient<Database>,
  marketSlug: string,
): Promise<MarketContext | null> {
  const { data: market } = await admin
    .from("markets")
    .select("id, slug, name, city, area, categories, character")
    .eq("slug", marketSlug)
    .eq("is_published", true)
    .maybeSingle();
  if (!market) return null;

  const [{ data: sectionRows }, { data: guideRows }] = await Promise.all([
    admin
      .from("market_sections")
      .select("id, name, specialization, notes")
      .eq("market_id", market.id),
    admin
      .from("market_category_guides")
      .select(
        "category, price_band_low, price_band_high, bargaining_note, quality_note, confidence",
      )
      .eq("market_id", market.id),
  ]);

  return {
    market,
    sections: sectionRows ?? [],
    guides: (guideRows ?? []).map((g) => ({
      category: g.category,
      priceBandLow: g.price_band_low,
      priceBandHigh: g.price_band_high,
      bargainingNote: g.bargaining_note,
      qualityNote: g.quality_note,
      confidence: g.confidence,
    })),
  };
}

/**
 * Aggregate published price_points into one honest answer per category. Raw
 * rows are read (service role) and collapsed here; only the aggregate returns.
 */
export async function marketIntelligenceByCategory(
  admin: SupabaseClient<Database>,
  marketId: string,
  categories: string[],
  now: Date = new Date(),
): Promise<Map<string, MarketIntelligence>> {
  const result = new Map<string, MarketIntelligence>();
  if (categories.length === 0) return result;

  const { data: rows } = await admin
    .from("price_points")
    .select("price, source, confidence, observed_at, shop_id, category")
    .eq("market_id", marketId)
    .eq("status", "published")
    .in("category", categories);

  const byCategory = new Map<string, PricePoint[]>();
  for (const row of rows ?? []) {
    if (!row.category) continue;
    const point = rowToPricePoint(row as PricePointRow);
    if (!point) continue;
    const bucket = byCategory.get(row.category) ?? [];
    bucket.push(point);
    byCategory.set(row.category, bucket);
  }

  for (const category of categories) {
    result.set(category, aggregate(byCategory.get(category) ?? [], now));
  }
  return result;
}

/**
 * Generate a market run plan end to end: load the market, aggregate the
 * intelligence for the requested categories, and build the honest game-plan.
 * Returns null when the market isn't a published, known market.
 */
export async function generateMarketRunPlan(
  admin: SupabaseClient<Database>,
  input: {
    marketSlug: string;
    items: RequestedItem[];
    budgetMax: number | null;
    now?: Date;
  },
): Promise<MarketRunPlan | null> {
  const context = await loadMarketContext(admin, input.marketSlug);
  if (!context) return null;

  const categories = [...new Set(input.items.map((i) => i.category))];
  const intelByCategory = await marketIntelligenceByCategory(
    admin,
    context.market.id,
    categories,
    input.now,
  );

  return buildMarketRunPlan({
    market: context.market,
    sections: context.sections,
    guides: context.guides,
    items: input.items,
    budgetMax: input.budgetMax,
    intelByCategory,
  });
}
