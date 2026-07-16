"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UsernameSchema } from "@/lib/identity/username";
import { AnswersSchema, runOnboarding } from "@/lib/taste/onboarding";
import {
  embedTaste,
  extractTasteDimensions,
  writeTasteSummary,
} from "@/lib/taste/profile";
import { QUIZ_VERSION, type QuizAnswers } from "@/lib/taste/quiz";

export type ClaimResult =
  | { ok: true; claimed?: string }
  | { ok: false; error: string };

/**
 * Step 1 of /setup: claim a username. One shot - the DB trigger blocks any
 * later change by the owner, so treat this as permanent.
 */
export async function claimUsername(raw: string): Promise<ClaimResult> {
  const user = await requireUser();

  const parsed = UsernameSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That name won't work.",
    };
  }
  const username = parsed.data;

  const supabase = await createClient();
  // The .is() filter makes the claim idempotent-safe: a profile whose
  // username is already set matches no rows (usernames are one-shot).
  const { data, error } = await supabase
    .from("profiles")
    .update({ username })
    .eq("id", user.id)
    .is("username", null)
    .select("username");

  if (error) {
    // Unique violation = someone got there first.
    if (error.code === "23505") {
      return { ok: false, error: "That name is taken. Try another." };
    }
    console.error("claimUsername failed", {
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "Couldn't save that. Try again." };
  }
  // Zero rows matched: the username was already set (another tab, a retry).
  // The step is done either way - let the flow advance.
  return { ok: true, claimed: data?.length ? username : undefined };
}

/**
 * Step 2 of /setup: the taste quiz. Same pipeline as classic onboarding,
 * but setup lands on the map - the app's new front door.
 */
export async function completeSetup(rawAnswers: QuizAnswers) {
  const user = await requireUser();
  const answers = AnswersSchema.parse(rawAnswers);
  const supabase = await createClient();

  await runOnboarding(supabase, user.id, answers);

  redirect("/map?welcome=1");
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
  if (!parsed.success) redirect("/setup?redo=1");

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
