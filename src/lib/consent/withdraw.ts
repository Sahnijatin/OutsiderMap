import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { PurgeTarget } from "./purposes";

/**
 * The consequence of withdrawing consent.
 *
 * Before this, "personalization off" only gated the READ paths - the app
 * stopped using your taste profile but went on holding it, and went on writing
 * interaction_events. Under DPDP §6(6) that is not a withdrawal, it is a
 * preference. Withdrawal has to actually cost us something.
 *
 * Must be called with the SERVICE-ROLE client: interaction_events is
 * append-only under RLS (owner select + insert, no delete), so the member's
 * own client would delete nothing and report success.
 */

type Admin = SupabaseClient<Database>;

export type PurgeResult = {
  tasteCleared: boolean;
  memoriesDeleted: number;
  eventsDeleted: number;
  errors: string[];
};

/**
 * Strip the inferred half of quiz_answers, keep the answers themselves.
 *
 * quiz_answers is stored as { version, answers, dimensions } - `answers` is
 * what the member typed, `dimensions` is what an LLM concluded from it. Only
 * the conclusion is ours to destroy.
 */
function withoutDimensions(quizAnswers: Json | null): Json {
  if (!quizAnswers || typeof quizAnswers !== "object" || Array.isArray(quizAnswers)) {
    return {};
  }
  const rest = { ...(quizAnswers as Record<string, Json>) };
  delete rest.dimensions;
  return rest as Json;
}

/**
 * Delete the data derived from a member, for the targets given.
 *
 * Every step runs even if an earlier one fails and failures are accumulated
 * rather than thrown - the same posture as DELETE /api/account, and for the
 * same reason: a partial purge that reports success is worse than one that
 * says which part is outstanding. The daily reconciliation step in
 * lib/account/retention finishes whatever is left behind here.
 */
export async function purgeDerivedData(
  admin: Admin,
  userId: string,
  targets: PurgeTarget[],
): Promise<PurgeResult> {
  const result: PurgeResult = {
    tasteCleared: false,
    memoriesDeleted: 0,
    eventsDeleted: 0,
    errors: [],
  };
  if (targets.length === 0) return result;

  if (targets.includes("taste_derived")) {
    // Clear the derived columns; do NOT delete the row.
    //
    // The raw quiz answers are what the member gave us, not something we
    // inferred, and the shipped toggle copy already promises exactly this
    // ("Off answers from your quiz and the moment only"). Deleting the row
    // would also break retryTasteRead() in setup/actions.ts and force a
    // re-quiz if they ever switch personalization back on.
    const { data: existing, error: readError } = await admin
      .from("taste_profiles")
      .select("quiz_answers")
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) {
      result.errors.push(`taste profile read: ${readError.message}`);
    } else if (existing) {
      const { error } = await admin
        .from("taste_profiles")
        .update({
          learned_signals: {},
          taste_summary: null,
          embedding: null,
          quiz_answers: withoutDimensions(existing.quiz_answers),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) result.errors.push(`taste profile: ${error.message}`);
      else result.tasteCleared = true;
    }
  }

  if (targets.includes("member_memory")) {
    const { data, error } = await admin
      .from("member_memory")
      .delete()
      .eq("user_id", userId)
      .select("id");
    if (error) result.errors.push(`member memory: ${error.message}`);
    else result.memoriesDeleted = data?.length ?? 0;
  }

  if (targets.includes("interaction_events")) {
    const { data, error } = await admin
      .from("interaction_events")
      .delete()
      .eq("user_id", userId)
      .select("id");
    if (error) result.errors.push(`interaction events: ${error.message}`);
    else result.eventsDeleted = data?.length ?? 0;
  }

  return result;
}
