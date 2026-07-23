import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Server-side wrappers over the metrics RPCs (migration 34). All are admin-only
 * (the RPCs guard on is_admin()), so call them with the admin's session client
 * — auth.uid() must be the admin for the guard to resolve.
 */

export type AcceptRate = { asks: number; accepts: number };
export type DailyPoint = {
  day: string;
  asks: number;
  accepts: number;
  activeUsers: number;
};
export type FunnelStage = { stage: string; n: number; ord: number };
export type RetentionCohort = {
  cohortWeek: string;
  cohortSize: number;
  d1: number;
  d7: number;
  d30: number;
};

export async function getAcceptRate(
  supabase: SupabaseClient<Database>,
  days = 7,
): Promise<AcceptRate> {
  const { data, error } = await supabase.rpc("metrics_accept_rate", {
    p_days: days,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { asks: row?.asks ?? 0, accepts: row?.accepts ?? 0 };
}

export async function getDaily(
  supabase: SupabaseClient<Database>,
  days = 30,
): Promise<DailyPoint[]> {
  const { data, error } = await supabase.rpc("metrics_daily", { p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    day: r.day,
    asks: r.asks,
    accepts: r.accepts,
    activeUsers: r.active_users,
  }));
}

export async function getFunnel(
  supabase: SupabaseClient<Database>,
  days = 30,
): Promise<FunnelStage[]> {
  const { data, error } = await supabase.rpc("metrics_funnel", { p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ stage: r.stage, n: r.n, ord: r.ord }));
}

export async function getRetention(
  supabase: SupabaseClient<Database>,
  weeks = 8,
): Promise<RetentionCohort[]> {
  const { data, error } = await supabase.rpc("metrics_retention", {
    p_weeks: weeks,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    cohortWeek: r.cohort_week,
    cohortSize: r.cohort_size,
    d1: r.d1,
    d7: r.d7,
    d30: r.d30,
  }));
}
