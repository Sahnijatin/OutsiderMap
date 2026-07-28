import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { GAP_LABELS, MIN_DESCRIPTION_CHARS, type ReadinessGap } from "@/lib/catalog/readiness";

/**
 * How much catalog the concierge can actually reach.
 *
 * Every other number on the metrics page measures how well the product uses
 * what it has. This one measures how much it has, and it is the ceiling on all
 * of them: `searchCatalog` pulls 24 candidates and narrows to 12, so two
 * members with opposite taste see overlapping picks by arithmetic once the
 * retrievable catalog is small enough - no ranker fixes that.
 *
 * It has never been visible anywhere. `catalogSize` exists inside the eval
 * harness, which needs a seeded database and a provider key to run, so in
 * practice nobody has been able to look at this number at all.
 */

export interface CatalogInventory {
  /** Published, not a chain, and carrying an embedding. THE number. */
  retrievable: number;
  /**
   * Published but with no embedding - live on the map and invisible to chat,
   * search and recommendations, because `match_places` filters
   * `embedding is not null`. Quorum publishes flip `is_published` in SQL and
   * cannot call an embeddings API, so this is where they land.
   */
  invisible: number;
  /** Drafts that clear the readiness bar - the work that is ready to land. */
  readyDrafts: number;
  /** Drafts that do not. */
  blockedDrafts: number;
  /** Which gap blocks how many, worst first - the content ops to-do list. */
  gaps: Array<{ gap: ReadinessGap; label: string; count: number }>;
}

/**
 * `char_length(description) >= N` has no PostgREST equivalent, so this asks for
 * N single-character wildcards followed by anything: a string matches only if
 * it is at least that long. Ugly, and exactly equivalent for the purpose.
 */
const LONG_ENOUGH = "_".repeat(MIN_DESCRIPTION_CHARS) + "%";

/**
 * `vibe_tags` is `text[] not null default '{}'`, so "has no tags" is equality
 * against the empty array. Passed as a real array rather than the literal
 * `"{}"` so the typed client serializes it - hand-writing the Postgres literal
 * would work today and typecheck as a lie.
 */
const EMPTY_TAGS: string[] = [];

type Client = SupabaseClient<Database>;

/**
 * ## Why every filter here is written positively
 *
 * The obvious way to count "drafts with no usable description" is
 * `not.like(...)`. In SQL `NOT (NULL LIKE '...')` is NULL, not true, so that
 * filter silently drops every row whose description is null - the exact rows it
 * exists to find. Each gap is therefore counted as "all drafts minus the drafts
 * that have the thing", which cannot trap on a null.
 *
 * ## Where this rule and `readinessGaps` differ, on purpose
 *
 * `places.name` is NOT NULL, so the only name failure the pure rule can catch
 * is a whitespace-only string, which PostgREST cannot express. These counts are
 * therefore an upper bound on what is ready. That is the safe direction: the
 * dashboard may promise a handful more than exists, while the gate that
 * actually publishes runs the strict pure rule per row and lets nothing
 * through. A test pins the two against shared fixtures so no wider gap opens.
 */
export async function catalogInventory(
  supabase: Client,
): Promise<CatalogInventory> {
  const count = async (
    build: (
      q: ReturnType<typeof draftQuery>,
    ) => PromiseLike<{ count: number | null }>,
  ) => (await build(draftQuery())).count ?? 0;

  function draftQuery() {
    return supabase.from("places").select("id", { count: "exact", head: true });
  }

  const [
    retrievable,
    invisible,
    allDrafts,
    chains,
    withArea,
    withDescription,
    withTags,
    withCoords,
    readyDrafts,
  ] = await Promise.all([
    count((q) =>
      q.eq("is_published", true).eq("is_chain", false).not("embedding", "is", null),
    ),
    count((q) =>
      q.eq("is_published", true).eq("is_chain", false).is("embedding", null),
    ),
    count((q) => q.eq("is_published", false)),
    count((q) => q.eq("is_published", false).eq("is_chain", true)),
    count((q) =>
      q.eq("is_published", false).eq("is_chain", false).not("area", "is", null),
    ),
    count((q) =>
      q.eq("is_published", false).eq("is_chain", false).like("description", LONG_ENOUGH),
    ),
    count((q) =>
      q.eq("is_published", false).eq("is_chain", false).neq("vibe_tags", EMPTY_TAGS),
    ),
    count((q) =>
      q
        .eq("is_published", false)
        .eq("is_chain", false)
        .not("lat", "is", null)
        .not("lng", "is", null),
    ),
    count((q) =>
      q
        .eq("is_published", false)
        .eq("is_chain", false)
        .not("area", "is", null)
        .not("lat", "is", null)
        .not("lng", "is", null)
        .neq("vibe_tags", EMPTY_TAGS)
        .like("description", LONG_ENOUGH),
    ),
  ]);

  // Non-chain drafts are the denominator for every quality gap; a chain is not
  // an unfinished listing, it is one that must never be published at all.
  const candidates = Math.max(0, allDrafts - chains);
  const gaps: CatalogInventory["gaps"] = [
    { gap: "chain", count: chains },
    { gap: "area", count: candidates - withArea },
    { gap: "description", count: candidates - withDescription },
    { gap: "vibe_tags", count: candidates - withTags },
    { gap: "coordinates", count: candidates - withCoords },
  ]
    .map(({ gap, count }) => ({
      gap: gap as ReadinessGap,
      label: GAP_LABELS[gap as ReadinessGap],
      count: Math.max(0, count),
    }))
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    retrievable,
    invisible,
    readyDrafts,
    blockedDrafts: Math.max(0, allDrafts - readyDrafts),
    gaps,
  };
}

/** How many places the daily cron can rescue per run (see embed-sweep). */
export const SWEEP_PER_DAY = 50;

/**
 * How many drafts one click of the admin backlog button may publish.
 *
 * Not a safety limit so much as an arithmetic one: every publish embeds first,
 * at 32 places per OpenAI call, and the ~6,100 imported drafts would be nearly
 * two hundred sequential calls - far past any request timeout. So it is a
 * repeatable batch, and the notice says how many are left. A run that ends with
 * "1,847 still ready" is a better tool than one that times out at 40%.
 *
 * Lives here rather than beside the action because a "use server" module may
 * only export async functions, and the page needs this number to label the
 * button before anything is clicked.
 */
export const PUBLISH_BATCH = 150;

/**
 * How long the safety net alone would take to clear the invisible backlog.
 *
 * Worth stating plainly on the dashboard: the sweep is a net, not a plan, and
 * "1,800 places invisible" reads very differently next to "36 days at the
 * current sweep rate". Null when there is nothing waiting.
 */
export function daysToClearInvisible(invisible: number): number | null {
  return invisible > 0 ? Math.ceil(invisible / SWEEP_PER_DAY) : null;
}
