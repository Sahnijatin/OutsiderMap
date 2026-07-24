import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Typed wrappers around the Scout Economy RPCs (migrations 30/31). Every
 * mutation lives in the database behind a security-definer RPC; these shape
 * params + errors. Bounty listings are deliberately *blind* - the lister's
 * identity is never selected, so validators can't be biased or collude.
 */

/** A bounty as shown to a prospective validator - no lister identity. */
export type NearbyBounty = {
  id: string;
  type: "verify" | "discover";
  area: string | null;
  city: string | null;
  bounty_points: number;
  quorum_needed: number;
  created_at: string;
  place: {
    name: string;
    area: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
};

export type SubmitConfirmationInput = {
  bountyId: string;
  verdict: "exists" | "not_exists";
  quality?: number | null;
  media?: Database["public"]["Tables"]["quest_confirmations"]["Row"]["media"];
  capturedLat?: number | null;
  capturedLng?: number | null;
  capturedAt?: string | null;
};

/** Postgres RAISE messages read fine to humans; trim the "ERROR:" noise. */
function friendly(message: string): string {
  return message.replace(/^.*?:\s*/, "").trim() || message;
}

/**
 * Open bounties near the member, filterable by area/city. Blind by
 * construction (no lister_id selected). Eligibility (reputation, independence)
 * is enforced when a confirmation is submitted; this is the discovery list.
 */
export async function listNearbyBounties(
  supabase: SupabaseClient<Database>,
  opts: { city?: string; area?: string; limit?: number } = {},
): Promise<NearbyBounty[]> {
  let query = supabase
    .from("bounty_quests")
    .select(
      "id, type, area, city, bounty_points, quorum_needed, created_at, submission_id",
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.city) query = query.eq("city", opts.city);
  if (opts.area) query = query.eq("area", opts.area);

  const { data, error } = await query;
  if (error) throw new Error(friendly(error.message));

  const rows = data ?? [];
  const placeIds = rows
    .map((r) => r.submission_id)
    .filter((id): id is string => Boolean(id));

  const placeById = new Map<
    string,
    { name: string; area: string | null; lat: number | null; lng: number | null }
  >();
  if (placeIds.length > 0) {
    // Read place location only - never who submitted it.
    const { data: places } = await supabase
      .from("places")
      .select("id, name, area, lat, lng")
      .in("id", placeIds);
    for (const p of places ?? []) {
      placeById.set(p.id, {
        name: p.name,
        area: p.area,
        lat: p.lat,
        lng: p.lng,
      });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    area: r.area,
    city: r.city,
    bounty_points: r.bounty_points,
    quorum_needed: r.quorum_needed,
    created_at: r.created_at,
    place: r.submission_id ? (placeById.get(r.submission_id) ?? null) : null,
  }));
}

/**
 * Submit a confirmation. The RPC computes geo_ok / independence_ok / anomaly
 * server-side, records the one-vote-per-validator verdict, and re-aggregates
 * the bounty. Media must already be moderated (#70) by the caller.
 */
export async function submitConfirmation(
  supabase: SupabaseClient<Database>,
  input: SubmitConfirmationInput,
): Promise<string> {
  const { data, error } = await supabase.rpc("submit_confirmation", {
    p_bounty_id: input.bountyId,
    p_verdict: input.verdict,
    p_quality: input.quality ?? null,
    p_media: input.media ?? null,
    p_captured_lat: input.capturedLat ?? null,
    p_captured_lng: input.capturedLng ?? null,
    p_captured_at: input.capturedAt ?? null,
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}
