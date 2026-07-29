import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { City } from "@/lib/cities";

/**
 * Where the catalog actually is, area by area (#124).
 *
 * `catalogInventory` answers "how much do we have"; this answers "how much do
 * we have *where the member is standing*", which is a different and harsher
 * question. A city-wide count of 400 looks healthy right up until someone in
 * Indirapuram opens the map and the honest answer is somewhere else entirely.
 *
 * The failure is silent by construction. `keywordSearch` relaxes an
 * over-constrained area filter to a city-wide sample rather than dead-ending
 * (`catalog/search.ts`), and `quests/generate` does the same. That relaxation is
 * right - a turn with something to rank beats a blank - but it means a dead area
 * never surfaces as an error anywhere. It surfaces as a member being answered
 * about a neighbourhood they didn't ask about, and concluding the app isn't for
 * them. This module is the only place that difference is visible.
 *
 * Reads `cities.areas` as the denominator, so an area added to the city (the
 * NCR expansion in migration 43 took the list from 22 to 69) shows up as a gap
 * the moment it's declared, rather than waiting for someone to notice.
 */

type Client = SupabaseClient<Database>;

/**
 * Retrieval pulls 24 candidates and narrows to 12 (`searchCatalog`). So 12 is
 * not a target, it's the floor at which the ranker still has a choice to make:
 * below it, every member asking about that area is shown the same handful
 * regardless of taste, and personalization is arithmetic rather than judgement.
 */
export const AREA_CONFIDENT = 12;

export type AreaCoverageState =
  /** Nothing retrievable. The area-scoped query relaxes and answers city-wide. */
  | "dead"
  /** Answerable, but the same places for everyone - no taste headroom. */
  | "thin"
  /** Enough that the ranker's choice is the thing being felt. */
  | "covered";

export type AreaCoverage = {
  area: string;
  /** Published, non-chain, embedded - the same bar `catalogInventory` uses. */
  retrievable: number;
  state: AreaCoverageState;
};

export type CityCoverage = {
  areas: AreaCoverage[];
  dead: number;
  thin: number;
  covered: number;
  /**
   * Retrievable places whose `area` isn't in the city's declared list - a
   * typo'd or renamed area, invisible to every area-scoped ask even though it
   * is published. Counted, not itemized: it's a data-fix signal, not a harvest
   * target.
   */
  unplaced: number;
};

export function classifyArea(retrievable: number): AreaCoverageState {
  if (retrievable <= 0) return "dead";
  return retrievable >= AREA_CONFIDENT ? "covered" : "thin";
}

/**
 * Pure half, so the thresholds are testable without a database.
 *
 * Sorted worst-first: this list is read as a work queue (which area does the
 * harvest console point at next), not as a report card. Ties break
 * alphabetically so the order is stable between runs and a reader can find an
 * area again after re-running.
 */
export function summarizeCoverage(
  declaredAreas: string[],
  counts: Map<string, number>,
): CityCoverage {
  const declared = new Set(declaredAreas);
  const areas: AreaCoverage[] = declaredAreas
    .map((area) => {
      const retrievable = counts.get(area) ?? 0;
      return { area, retrievable, state: classifyArea(retrievable) };
    })
    .sort((a, b) => a.retrievable - b.retrievable || a.area.localeCompare(b.area));

  let unplaced = 0;
  for (const [area, n] of counts) {
    if (!declared.has(area)) unplaced += n;
  }

  return {
    areas,
    dead: areas.filter((a) => a.state === "dead").length,
    thin: areas.filter((a) => a.state === "thin").length,
    covered: areas.filter((a) => a.state === "covered").length,
    unplaced,
  };
}

/**
 * Takes the already-resolved city rather than a slug, so the declared-area list
 * is the same one every recommendation path filters against (`resolveCity`) -
 * including its fallback record. Reading `cities` again here could disagree.
 *
 * Tallying happens in JS because PostgREST has no GROUP BY and the alternative
 * is one COUNT per area - 69 round trips for Delhi NCR, to group a few hundred
 * rows. One `area`-only select over published rows is a smaller read than the
 * page around it already does.
 */
export async function cityCoverage(
  supabase: Client,
  city: Pick<City, "slug" | "areas">,
): Promise<CityCoverage> {
  const { data: rows, error } = await supabase
    .from("places")
    .select("area")
    .eq("city", city.slug)
    .eq("is_published", true)
    .eq("is_chain", false)
    .not("embedding", "is", null)
    .not("area", "is", null);
  if (error) throw new Error(`coverage query failed: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    if (!row.area) continue;
    counts.set(row.area, (counts.get(row.area) ?? 0) + 1);
  }

  return summarizeCoverage(city.areas, counts);
}
