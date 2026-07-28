import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import {
  catalogInventory,
  daysToClearInvisible,
  SWEEP_PER_DAY,
} from "@/lib/catalog/inventory";
import {
  isReadyToPublish,
  MIN_DESCRIPTION_CHARS,
  type ReadinessInput,
} from "@/lib/catalog/readiness";

/**
 * The retrievable-catalog counts, and the thing they are most likely to get
 * wrong: the readiness rule is written twice, once as a pure predicate and once
 * as PostgREST filters. The last test here is the one that matters.
 */

/** One recorded filter call: [method, ...args]. */
type Filter = [string, ...unknown[]];

/**
 * PostgREST stand-in that records the filters of each query and answers with a
 * count. `counts` is consumed in call order, which is the order of the
 * Promise.all in `catalogInventory`.
 */
function fakeSupabase(counts: number[]) {
  const queries: Filter[][] = [];
  let call = 0;

  const client = {
    from() {
      const filters: Filter[] = [];
      queries.push(filters);
      const chain: Record<string, unknown> = {
        then(resolve: (v: unknown) => unknown) {
          const count = counts[call] ?? 0;
          call += 1;
          return Promise.resolve({ count, error: null }).then(resolve);
        },
      };
      for (const m of ["select", "eq", "is", "not", "neq", "like", "gte"]) {
        chain[m] = (...args: unknown[]) => {
          filters.push([m, ...args]);
          return chain;
        };
      }
      return chain;
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, queries };
}

/**
 * The call order of the Promise.all, so the fixtures below stay readable.
 * retrievable, invisible, allDrafts, chains, withArea, withDescription,
 * withTags, withCoords, readyDrafts.
 */
const COUNTS = [40, 6, 100, 10, 70, 55, 60, 80, 30];

describe("catalogInventory", () => {
  it("reports the retrievable count and the invisible one separately", async () => {
    const { client } = fakeSupabase(COUNTS);
    const inv = await catalogInventory(client);
    expect(inv.retrievable).toBe(40);
    expect(inv.invisible).toBe(6);
  });

  it("counts retrievable as published, non-chain AND embedded", async () => {
    // All three matter and for different reasons. `match_places` filters
    // `embedding is not null`, and chains never surface by product law - so a
    // "published places" count would overstate the real ceiling twice over.
    const { client, queries } = fakeSupabase(COUNTS);
    await catalogInventory(client);
    expect(queries[0]).toContainEqual(["eq", "is_published", true]);
    expect(queries[0]).toContainEqual(["eq", "is_chain", false]);
    expect(queries[0]).toContainEqual(["not", "embedding", "is", null]);
  });

  it("splits drafts into ready and blocked", async () => {
    const { client } = fakeSupabase(COUNTS);
    const inv = await catalogInventory(client);
    expect(inv.readyDrafts).toBe(30);
    expect(inv.blockedDrafts).toBe(70); // 100 drafts - 30 ready
  });

  it("ranks what is blocking them, worst first", async () => {
    const { client } = fakeSupabase(COUNTS);
    const inv = await catalogInventory(client);

    // 90 non-chain drafts. Missing: area 20, description 35, tags 30, coords 10.
    expect(inv.gaps.map((g) => [g.gap, g.count])).toEqual([
      ["description", 35],
      ["vibe_tags", 30],
      ["area", 20],
      ["chain", 10],
      ["coordinates", 10],
    ]);
  });

  it("omits a gap that blocks nothing", async () => {
    // 90 non-chain drafts, all of which have everything.
    const { client } = fakeSupabase([40, 6, 90, 0, 90, 90, 90, 90, 90]);
    expect((await catalogInventory(client)).gaps).toEqual([]);
  });

  it("never reports a negative count", async () => {
    // The gap counts are subtractions across nine separate queries, so a race
    // with an editor saving a row can put them out of step. A tile reading
    // "-3 missing an area" would read as a bug in the dashboard rather than a
    // rounding artefact of counting live data.
    const { client } = fakeSupabase([0, 0, 10, 0, 99, 99, 99, 99, 99]);
    const inv = await catalogInventory(client);
    expect(inv.blockedDrafts).toBeGreaterThanOrEqual(0);
    expect(inv.gaps.every((g) => g.count >= 0)).toBe(true);
  });

  it("asks for a description long enough to be worth embedding", async () => {
    const { client, queries } = fakeSupabase(COUNTS);
    await catalogInventory(client);

    const like = queries[5].find(([m]) => m === "like");
    expect(like).toBeDefined();
    // N single-character wildcards then anything: matches only strings at
    // least that long, which is the closest PostgREST gets to char_length().
    expect(like![2]).toBe("_".repeat(MIN_DESCRIPTION_CHARS) + "%");
  });

  it("never asks a not-like question, which would drop the null rows", async () => {
    // The trap this whole module is written around: in SQL `NOT (NULL LIKE
    // '...')` is NULL, not true, so `not.like` silently excludes exactly the
    // rows with no description at all - the ones it was meant to find.
    const { client, queries } = fakeSupabase(COUNTS);
    await catalogInventory(client);
    for (const filters of queries) {
      expect(filters.some(([m, , op]) => m === "not" && op === "like")).toBe(false);
    }
  });
});

describe("the SQL rule and the pure rule agree", () => {
  /**
   * The readiness bar is written twice - once as `readinessGaps`, once as
   * PostgREST filters - because counting six thousand drafts in code would mean
   * pulling six thousand drafts into a page render. Two definitions of one rule
   * drift, so this walks the same fixtures through both.
   *
   * `sqlWouldCount` mirrors, by hand, exactly what the filters in
   * `catalogInventory`'s ready query select.
   */
  const sqlWouldCount = (p: ReadinessInput): boolean =>
    p.is_chain === false &&
    p.area !== null &&
    p.lat !== null &&
    p.lng !== null &&
    (p.vibe_tags?.length ?? 0) > 0 &&
    (p.description?.length ?? 0) >= MIN_DESCRIPTION_CHARS;

  const base: ReadinessInput = {
    name: "Karim's",
    area: "Old Delhi",
    description: "x".repeat(MIN_DESCRIPTION_CHARS),
    vibe_tags: ["late-night"],
    lat: 28.65,
    lng: 77.23,
    is_chain: false,
  };

  const FIXTURES: ReadinessInput[] = [
    base,
    { ...base, is_chain: true },
    { ...base, area: null },
    { ...base, lat: null },
    { ...base, lng: null },
    { ...base, vibe_tags: [] },
    { ...base, description: null },
    { ...base, description: "too short" },
    { ...base, description: "x".repeat(MIN_DESCRIPTION_CHARS - 1) },
  ];

  it("agrees on every fixture that is not the known whitespace case", () => {
    for (const fixture of FIXTURES) {
      expect({ ...fixture, agrees: sqlWouldCount(fixture) }).toEqual({
        ...fixture,
        agrees: isReadyToPublish(fixture),
      });
    }
  });

  it("errs toward over-counting, never toward publishing something thin", () => {
    // The one documented divergence: `places.name` is NOT NULL, so PostgREST
    // cannot express "name is only whitespace" and the SQL count includes a row
    // the pure rule rejects. That direction is safe - the dashboard promises
    // one more than exists, and the gate that actually publishes runs the pure
    // rule per row. The reverse would put a nameless place in front of a member.
    const whitespaceName = { ...base, name: "   " };
    expect(sqlWouldCount(whitespaceName)).toBe(true);
    expect(isReadyToPublish(whitespaceName)).toBe(false);
  });
});

describe("daysToClearInvisible", () => {
  it("says how long the safety net alone would take", () => {
    // "1,800 places invisible" reads very differently next to "36 days at the
    // current sweep rate". The sweep is a net, not a plan.
    expect(daysToClearInvisible(SWEEP_PER_DAY * 36)).toBe(36);
    expect(daysToClearInvisible(1)).toBe(1);
    expect(daysToClearInvisible(SWEEP_PER_DAY + 1)).toBe(2);
  });

  it("says nothing when nothing is waiting", () => {
    expect(daysToClearInvisible(0)).toBeNull();
  });
});
