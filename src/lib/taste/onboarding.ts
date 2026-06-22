import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  embedTaste,
  extractTasteDimensions,
  writeTasteSummary,
} from "@/lib/taste/profile";
import { QUIZ_VERSION, type QuizAnswers } from "@/lib/taste/quiz";
import type { Database } from "@/types/database";

export const AnswersSchema = z.record(
  z.string(),
  z.union([z.string().max(2000), z.array(z.string().max(200)).max(20)]),
);

/**
 * Persist quiz answers and run the taste pipeline (structured read -> summary
 * -> embedding). Shared by the web `completeOnboarding` server action and the
 * mobile `POST /api/onboarding` route, so both produce identical profiles.
 *
 * Raw answers are saved first - the AI step must never be able to lose a
 * finished quiz - and pipeline failures degrade gracefully (the profile page
 * shows a "still reading you" state and can retry). The caller supplies a
 * user-scoped Supabase client; all writes pass RLS as the owner.
 */
export async function runOnboarding(
  supabase: SupabaseClient<Database>,
  userId: string,
  answers: QuizAnswers,
) {
  const { data: existing } = await supabase
    .from("taste_profiles")
    .select("version")
    .eq("user_id", userId)
    .maybeSingle();

  const { error: saveError } = await supabase.from("taste_profiles").upsert({
    user_id: userId,
    quiz_answers: { version: QUIZ_VERSION, answers },
    version: existing ? existing.version + 1 : 1,
    updated_at: new Date().toISOString(),
  });
  if (saveError) {
    throw new Error(`Could not save your answers: ${saveError.message}`);
  }

  try {
    const dimensions = await extractTasteDimensions(answers);
    const [summary, embedding] = await Promise.all([
      writeTasteSummary(answers, dimensions),
      embedTaste(dimensions),
    ]);

    await supabase
      .from("taste_profiles")
      .update({
        quiz_answers: { version: QUIZ_VERSION, answers, dimensions },
        taste_summary: summary,
        embedding: JSON.stringify(embedding),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  } catch (error) {
    console.error("Taste pipeline failed during onboarding:", error);
  }

  await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId);
}
