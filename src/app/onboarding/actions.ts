"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  embedTaste,
  extractTasteDimensions,
  writeTasteSummary,
} from "@/lib/taste/profile";
import { AnswersSchema, runOnboarding } from "@/lib/taste/onboarding";
import { QUIZ_VERSION, type QuizAnswers } from "@/lib/taste/quiz";

export async function completeOnboarding(rawAnswers: QuizAnswers) {
  const user = await requireUser();
  const answers = AnswersSchema.parse(rawAnswers);
  const supabase = await createClient();

  // Shared pipeline (also used by POST /api/onboarding for mobile).
  await runOnboarding(supabase, user.id, answers);

  redirect("/profile?welcome=1");
}

/** Retry the AI read from the profile page when onboarding degraded. */
export async function retryTasteRead() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from("taste_profiles")
    .select("quiz_answers")
    .eq("user_id", user.id)
    .single();

  const parsed = z
    .object({ answers: AnswersSchema })
    .safeParse(row?.quiz_answers);
  if (!parsed.success) redirect("/onboarding");

  const answers = parsed.data.answers;
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
    .eq("user_id", user.id);

  redirect("/profile");
}
