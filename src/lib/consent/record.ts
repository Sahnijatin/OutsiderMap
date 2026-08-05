import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentMethod, Database } from "@/types/database";
import { PRIVACY_POLICY_VERSION } from "./policy";
import type { ConsentMap, ConsentPurpose } from "./purposes";

/**
 * Writing and reading consent.
 *
 * Always through the member's own RLS-scoped client, never the service role:
 * recording that someone consented is a claim about an act they performed, and
 * it should be made by a request they authenticated. The RPC is security
 * definer precisely so this can be true - the tables themselves have no write
 * policy at all.
 *
 * The policy version is stamped here rather than passed in by callers. A
 * caller that can name the version it is recording against is a caller that
 * can record consent to a policy the member never saw.
 */

type Client = SupabaseClient<Database>;

export async function recordConsent(
  supabase: Client,
  input: {
    purpose: ConsentPurpose;
    granted: boolean;
    method: ConsentMethod;
    source?: Record<string, unknown>;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("record_consent", {
    p_purpose: input.purpose,
    p_granted: input.granted,
    p_policy_version: PRIVACY_POLICY_VERSION,
    p_method: input.method,
    p_source: (input.source ?? {}) as never,
  });
  return { error: error?.message ?? null };
}

/** Record several purposes at once - the notice screen grants in one go. */
export async function recordConsents(
  supabase: Client,
  entries: Array<{ purpose: ConsentPurpose; granted: boolean }>,
  method: ConsentMethod,
  source?: Record<string, unknown>,
): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  for (const entry of entries) {
    const { error } = await recordConsent(supabase, { ...entry, method, source });
    if (error) errors.push(`${entry.purpose}: ${error}`);
  }
  return { errors };
}

/** Current state as a map, for isGranted(). Missing rows stay missing. */
export async function loadConsents(
  supabase: Client,
  userId: string,
): Promise<ConsentMap> {
  const { data } = await supabase
    .from("consents")
    .select("purpose, granted")
    .eq("user_id", userId);

  const map: ConsentMap = {};
  for (const row of data ?? []) map[row.purpose] = row.granted;
  return map;
}
