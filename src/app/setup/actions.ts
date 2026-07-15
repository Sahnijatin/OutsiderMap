"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UsernameSchema } from "@/lib/identity/username";
import { AnswersSchema, runOnboarding } from "@/lib/taste/onboarding";
import type { QuizAnswers } from "@/lib/taste/quiz";

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
