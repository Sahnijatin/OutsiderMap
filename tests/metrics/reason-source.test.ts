import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

vi.mock("server-only", () => ({}));

import { getReasonSource } from "@/lib/metrics/queries";

/**
 * The own-reason rate: how often the concierge writes a reason for this member
 * versus falling back to the editor note every member sees.
 */

function fakeRpc(
  result: { data: unknown; error: { message: string } | null },
  onCall?: (name: string, args: unknown) => void,
) {
  return {
    rpc: (name: string, args: unknown) => {
      onCall?.(name, args);
      return Promise.resolve(result);
    },
  } as unknown as SupabaseClient<Database>;
}

describe("getReasonSource", () => {
  it("maps the RPC row into the shape the tile reads", async () => {
    const calls: { name: string; args: unknown }[] = [];
    const supabase = fakeRpc(
      { data: [{ model: 42, editor_note: 8, degraded: 3 }], error: null },
      (name, args) => calls.push({ name, args }),
    );

    expect(await getReasonSource(supabase, 7)).toEqual({
      model: 42,
      editorNote: 8,
      degraded: 3,
    });
    expect(calls).toEqual([
      { name: "metrics_reason_source", args: { p_days: 7 } },
    ]);
  });

  it("reads zero rather than NaN before any picks exist", async () => {
    // A fresh install has no assistant messages at all; the tile shows "-".
    const supabase = fakeRpc({ data: [], error: null });
    expect(await getReasonSource(supabase)).toEqual({
      model: 0,
      editorNote: 0,
      degraded: 0,
    });
  });

  it("surfaces an RPC failure instead of reporting a healthy zero", async () => {
    // The is_admin() guard raises for non-admins. Swallowing that would render
    // a confident 0% that looks like a product problem rather than a denied
    // query.
    const supabase = fakeRpc({
      data: null,
      error: { message: "admin only" },
    });
    await expect(getReasonSource(supabase)).rejects.toThrow("admin only");
  });

  it("keeps degraded picks out of the ratio", async () => {
    // Degraded turns fall back to keyword search, whose picks carry editor
    // notes by construction. Folding them in would let a provider outage read
    // as a personalization regression - the one misreading this metric exists
    // to prevent. The RPC does the exclusion; this pins the contract the tile
    // depends on.
    const supabase = fakeRpc({
      data: [{ model: 9, editor_note: 1, degraded: 90 }],
      error: null,
    });
    const reasons = await getReasonSource(supabase);
    expect(reasons.model + reasons.editorNote).toBe(10);
    expect(reasons.degraded).toBe(90);
  });
});
