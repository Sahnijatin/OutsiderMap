import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { CARD_FIELDS, fetchFeedPage } from "@/lib/feed/query";

vi.mock("server-only", () => ({}));

/**
 * Pins the feed's product laws at the query layer. A blog the author scoped to
 * its place page must never reach the feed, and that is enforced by exactly one
 * `.eq()` - which is easy to drop in a refactor and invisible until someone's
 * place-only blog shows up in front of everyone.
 */

const USER = "11111111-1111-4111-8111-111111111111";

type EqCall = [string, unknown];

/** Records the filters fetchFeedPage applies, returning an empty page. */
function recordingClient(rows: unknown[] = []) {
  const eqCalls: EqCall[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "in", "lt", "limit"]) {
    builder[method] = () => builder;
  }
  builder.eq = (column: string, value: unknown) => {
    eqCalls.push([column, value]);
    return builder;
  };
  // The posts query is awaited without a terminal method.
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: rows, error: null });

  const supabase = {
    from: () => builder,
    rpc: (name: string) =>
      name === "hidden_user_ids"
        ? Promise.resolve({ data: [], error: null })
        : Promise.resolve({ data: [], error: null }),
  } as unknown as SupabaseClient<Database>;

  return { supabase, eqCalls };
}

describe("fetchFeedPage filters", () => {
  it("excludes posts the author kept off the feed", async () => {
    const { supabase, eqCalls } = recordingClient();
    await fetchFeedPage(supabase, USER, "discover");
    expect(eqCalls).toContainEqual(["show_in_feed", true]);
  });

  it("still only shows approved posts", async () => {
    const { supabase, eqCalls } = recordingClient();
    await fetchFeedPage(supabase, USER, "discover");
    expect(eqCalls).toContainEqual(["status", "approved"]);
  });

  it("applies both laws on the home tab too", async () => {
    const { supabase, eqCalls } = recordingClient();
    await fetchFeedPage(supabase, USER, "home");
    expect(eqCalls).toContainEqual(["show_in_feed", true]);
    expect(eqCalls).toContainEqual(["status", "approved"]);
  });

  it("restricts discover to public posts", async () => {
    const { supabase, eqCalls } = recordingClient();
    await fetchFeedPage(supabase, USER, "discover");
    expect(eqCalls).toContainEqual(["visibility", "public"]);
  });
});

describe("CARD_FIELDS", () => {
  // The single-post page and the profile route select this same string; a blog
  // card cannot render its title if the article child stops being fetched.
  it("fetches the article child so blog cards can render", () => {
    expect(CARD_FIELDS).toContain("article:post_articles(");
    expect(CARD_FIELDS).toContain("title");
    expect(CARD_FIELDS).toContain("slug");
  });

  /**
   * This one took the feed down in production. Migration 0056 added
   * post_article_places(post_id, place_id) with both columns forming the
   * composite primary key - PostgREST's exact definition of a junction table -
   * so it infers a SECOND, many-to-many posts<->places relationship alongside
   * posts.place_id. An unqualified `place:places(...)` then has two candidate
   * paths, PostgREST refuses with PGRST201, and every query using this string
   * throws: the feed, the single post page, /api/feed and the profile route.
   *
   * Naming the foreign key is the fix. Dropping the qualifier looks like a
   * harmless tidy-up and is a 500 on four surfaces, so it is pinned here.
   */
  it("pins the place embed to posts_place_id_fkey", () => {
    expect(CARD_FIELDS).toContain("place:places!posts_place_id_fkey(");
    expect(CARD_FIELDS).not.toMatch(/place:places\(/);
  });
});
