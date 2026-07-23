import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Member-facing reputation reads (#114 leaderboard / badge surface). profiles
 * and reward_grants are owner-or-admin read, so the cross-member leaderboard
 * goes through the scout_leaderboard security-definer RPC (public reputation
 * columns only); a member's own standing reads their own rows directly.
 */

export type LeaderboardEntry = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  curatorScore: number;
  verifiedSpots: number;
};

export async function getScoutLeaderboard(
  supabase: SupabaseClient<Database>,
  limit = 20,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("scout_leaderboard", {
    p_limit: limit,
  });
  if (error) throw new Error(error.message.replace(/^.*?:\s*/, "").trim());
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    curatorScore: r.curator_score,
    verifiedSpots: r.verified_spots,
  }));
}

export type EarnedBadge = { id: string; name: string; grantedAt: string };

export type MyReputation = {
  curatorScore: number;
  points: number;
  escrowed: number;
  verifiedSpots: number;
  confirmations: number;
  badges: EarnedBadge[];
};

export async function getMyReputation(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<MyReputation> {
  const [profile, points, escrowed, verified, confirmations, grants, thresholds] =
    await Promise.all([
      supabase.from("profiles").select("curator_score").eq("id", userId).maybeSingle(),
      supabase.rpc("points_balance", { p_user: userId }),
      supabase.rpc("points_escrowed", { p_user: userId }),
      supabase.rpc("scout_metric", { p_user: userId, p_metric: "verified_spots" }),
      supabase.rpc("scout_metric", { p_user: userId, p_metric: "confirmations" }),
      supabase
        .from("reward_grants")
        .select("threshold_id, granted_at")
        .eq("user_id", userId)
        .order("granted_at", { ascending: false }),
      // reward_grants has no typed FK relationship in the handwritten types, so
      // resolve threshold names with a second read rather than an embed.
      supabase.from("reward_thresholds").select("id, name"),
    ]);

  const nameById = new Map(
    (thresholds.data ?? []).map((t) => [t.id, t.name] as const),
  );
  const badges: EarnedBadge[] = (grants.data ?? []).map((g) => ({
    id: g.threshold_id,
    name: nameById.get(g.threshold_id) ?? g.threshold_id,
    grantedAt: g.granted_at,
  }));

  return {
    curatorScore: profile.data?.curator_score ?? 0,
    points: points.data ?? 0,
    escrowed: escrowed.data ?? 0,
    verifiedSpots: verified.data ?? 0,
    confirmations: confirmations.data ?? 0,
    badges,
  };
}
