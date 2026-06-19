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
import { QUIZ_VERSION, type QuizAnswers } from "@/lib/taste/quiz";

const AnswersSchema = z.record(
  z.string(),
  z.union([z.string().max(2000), z.array(z.string().max(200)).max(20)]),
);

export async function completeOnboarding(rawAnswers: QuizAnswers) {
  const user = await requireUser();
  const answers = AnswersSchema.parse(rawAnswers);
  const supabase = await createClient();

  // Persist the raw answers first - the AI pipeline must never be able to
  // lose a finished quiz.
  const { data: existing } = await supabase
    .from("taste_profiles")
    .select("version")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error: saveError } = await supabase.from("taste_profiles").upsert({
    user_id: user.id,
    quiz_answers: { version: QUIZ_VERSION, answers },
    version: existing ? existing.version + 1 : 1,
    updated_at: new Date().toISOString(),
  });
  if (saveError) {
    throw new Error(`Could not save your answers: ${saveError.message}`);
  }

  // Profile pipeline: structured read → summary → embedding. Failures here
  // degrade gracefully - the profile page shows a "still reading you" state
  // and the pipeline can be retried from there.
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
      .eq("user_id", user.id);
  } catch (error) {
    console.error("Taste pipeline failed during onboarding:", error);
  }

  await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);

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
