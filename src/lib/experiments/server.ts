import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { assignVariant } from "./assign";

/**
 * Server-side experiment resolution (#120 part 2b). Reads the enabled
 * experiments (via the security-definer active_experiments RPC, so no admin
 * client on the hot path) and assigns the caller a stable variant. Returns null
 * when the experiment is disabled or absent - the serve path then falls back to
 * its default behavior, so a flag that's off is a no-op.
 */

/** The load-bearing experiment: one confident answer vs a list of three. */
export const ONE_ANSWER_VS_LIST = "one_answer_vs_list";

export type Assignment = { experiment: string; variant: string };

export async function resolveVariant(
  client: SupabaseClient<Database>,
  key: string,
  userId: string,
): Promise<Assignment | null> {
  const { data, error } = await client.rpc("active_experiments");
  if (error || !data) return null;
  const exp = data.find((e) => e.key === key);
  if (!exp || !exp.variants || exp.variants.length < 2) return null;
  return { experiment: key, variant: assignVariant(key, userId, exp.variants) };
}
