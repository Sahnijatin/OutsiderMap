import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AreaDensity } from "./density";

/**
 * Server-side seam for the Scout admin desk (#114): density instrumentation,
 * the admin-verification fallback, discover-bounty creation, and the fallback
 * audit trail. The RPCs guard on is_admin(), so density/resolve/create must be
 * called with the admin's *session* client (auth.uid() = the admin), not the
 * service-role client where auth.uid() is null.
 */

/** Postgres RAISE messages read fine to humans; trim the "ERROR:" noise. */
function friendly(message: string): string {
  return message.replace(/^.*?:\s*/, "").trim() || message;
}

/** Per-city eligible-validator coverage. Thin cities are the fallback's remit. */
export async function getAreaDensity(
  supabase: SupabaseClient<Database>,
): Promise<AreaDensity[]> {
  const { data, error } = await supabase.rpc("area_validator_density", {});
  if (error) throw new Error(friendly(error.message));
  return (data ?? []).map((r) => ({
    city: r.city,
    openBounties: r.open_bounties,
    activeValidators: r.active_validators,
    thin: r.thin,
  }));
}

/** A bounty still awaiting resolution - the surface the admin fallback acts on. */
export type ResolvableBounty = {
  id: string;
  type: "verify" | "discover";
  area: string | null;
  city: string | null;
  status: "open" | "resolving";
  bounty_points: number;
  created_at: string;
};

export async function listResolvableBounties(
  admin: SupabaseClient<Database>,
  limit = 50,
): Promise<ResolvableBounty[]> {
  const { data, error } = await admin
    .from("bounty_quests")
    .select("id, type, area, city, status, bounty_points, created_at")
    .in("status", ["open", "resolving"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as ResolvableBounty[];
}

/** Hand-resolve a bounty where an independent quorum can't form. Logs the
 * fallback (with a density snapshot) inside the RPC. */
export async function resolveBounty(
  supabase: SupabaseClient<Database>,
  input: { bountyId: string; decision: "publish" | "reject"; note?: string | null },
): Promise<void> {
  const { error } = await supabase.rpc("admin_resolve_bounty", {
    p_bounty_id: input.bountyId,
    p_decision: input.decision,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(friendly(error.message));
}

/** Create a discover bounty (admin tip / area gap - no submitted place yet). */
export async function createDiscoverBounty(
  supabase: SupabaseClient<Database>,
  input: { area?: string | null; city: string; bountyPoints?: number },
): Promise<string> {
  const { data, error } = await supabase.rpc("admin_create_discover_bounty", {
    p_area: input.area ?? null,
    p_city: input.city,
    p_bounty_points: input.bountyPoints ?? 0,
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}

/**
 * Hand-mint a validator: curator_score = greatest(curator_score, 3), the
 * can_validate threshold. The genesis trigger (migration 0046) covers the
 * first 200 onboarded members; this is the desk's lever after that window.
 */
export async function grantValidator(
  supabase: SupabaseClient<Database>,
  targetId: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_grant_validator", {
    target: targetId,
  });
  if (error) throw new Error(friendly(error.message));
}

export type VerificationAuditRow = {
  id: string;
  bounty_id: string;
  decision: "publish" | "reject";
  active_validators: number | null;
  note: string | null;
  created_at: string;
};

/** Recent admin fallback resolutions - the "no silent caps" trail. */
export async function recentVerificationAudit(
  admin: SupabaseClient<Database>,
  limit = 20,
): Promise<VerificationAuditRow[]> {
  const { data, error } = await admin
    .from("scout_verification_audit")
    .select("id, bounty_id, decision, active_validators, note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(friendly(error.message));
  return (data ?? []) as VerificationAuditRow[];
}
