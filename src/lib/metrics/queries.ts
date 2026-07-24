import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Server-side wrappers over the metrics RPCs (migration 34). All are admin-only
 * (the RPCs guard on is_admin()), so call them with the admin's session client
 * - auth.uid() must be the admin for the guard to resolve.
 */

export type AcceptRate = { asks: number; accepts: number };
export type AnswerAcceptRate = { served: number; accepted: number };
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

/**
 * Precise Confident-Answer-Accept-Rate (#120 part 2a): served answers joined to
 * their acceptances by answer_id - no time-window proxy. Reads zero until the
 * answer_served/answer_accepted events accumulate, so the UI shows it as "-".
 */
export async function getAnswerAcceptRate(
  supabase: SupabaseClient<Database>,
  days = 7,
): Promise<AnswerAcceptRate> {
  const { data, error } = await supabase.rpc("metrics_answer_accept_rate", {
    p_days: days,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { served: row?.served ?? 0, accepted: row?.accepted ?? 0 };
}

export type Activation = {
  served: number;
  accepted: number;
  avgTtfaSeconds: number | null;
};

/** Activation-beat health (#121): first-answer accept-rate + time-to-first-answer. */
export async function getActivation(
  supabase: SupabaseClient<Database>,
  days = 30,
): Promise<Activation> {
  const { data, error } = await supabase.rpc("metrics_activation", {
    p_days: days,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return {
    served: row?.served ?? 0,
    accepted: row?.accepted ?? 0,
    avgTtfaSeconds: row?.avg_ttfa_seconds ?? null,
  };
}

export type ExperimentConfig = {
  key: string;
  description: string | null;
  variants: string[];
  enabled: boolean;
};
export type ExperimentVariant = {
  variant: string;
  served: number;
  accepted: number;
};

/** One experiment's config (admin-select RLS). Null if it doesn't exist. */
export async function getExperimentConfig(
  supabase: SupabaseClient<Database>,
  key: string,
): Promise<ExperimentConfig | null> {
  const { data, error } = await supabase
    .from("experiments")
    .select("key, description, variants, enabled")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Per-variant served/accepted for one experiment, off the precise 2a events. */
export async function getExperiment(
  supabase: SupabaseClient<Database>,
  key: string,
  days = 14,
): Promise<ExperimentVariant[]> {
  const { data, error } = await supabase.rpc("metrics_experiment", {
    p_key: key,
    p_days: days,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    variant: r.variant,
    served: r.served,
    accepted: r.accepted,
  }));
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
