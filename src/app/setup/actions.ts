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
import { SETUP_STEPS, type SetupStepId } from "@/lib/setup/steps";

export type ClaimResult =
  | { ok: true; claimed?: string }
  | { ok: false; error: string };

const HomeSchema = z.object({
  city: z.string().trim().min(1).max(40),
  area: z.string().trim().min(1).max(80),
});

const DisplayNameSchema = z.string().trim().min(1).max(60);

/**
 * Whether the marker write landed.
 *
 * It has to be reported, not swallowed: supabase-js `.rpc()` RETURNS its error
 * rather than throwing, so a caller that ignores the result cannot tell a
 * successful mark from a failed one. When the mark fails the resolver puts the
 * member straight back on the screen they just finished - and since skipping
 * writes the same marker, they have no way forward. Silence there is a dead
 * end; a reported failure is at least a retry.
 */
export type MarkResult = { ok: boolean };

async function markStep(id: SetupStepId): Promise<MarkResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_setup_step", { step: id });
  if (error) {
    console.error("mark_setup_step failed", { step: id, message: error.message });
    return { ok: false };
  }
  return { ok: true };
}

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

/** Where do you actually live. Marks the step whether or not an area is given. */
export async function saveHome(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = HomeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Pick an area from the list." };
  }
  const supabase = await createClient();

  // The area must belong to the chosen city. Checking here keeps the free-text
  // column aligned with the catalog rather than trusting a client-side list.
  const { data: city } = await supabase
    .from("cities")
    .select("slug, areas")
    .eq("slug", parsed.data.city)
    .eq("is_live", true)
    .maybeSingle();
  if (!city || !city.areas.includes(parsed.data.area)) {
    return { ok: false, error: "Pick an area from the list." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ home_city: city.slug, home_area: parsed.data.area })
    .eq("id", user.id);
  if (error) {
    console.error("saveHome failed", { message: error.message });
    return { ok: false, error: "Couldn't save that. Try again." };
  }

  // A failed marker leaves the resolver on this same screen, so report it
  // rather than returning ok and refreshing into an apparent no-op. The data
  // itself is saved; home_area doubles as evidence in the resolver, so this is
  // belt and braces rather than the only guard.
  if (!(await markStep("city")).ok) {
    return { ok: false, error: "Saved, but something stuck. Try again." };
  }
  return { ok: true };
}

/**
 * The name half of the identity screen. The photo has its own upload route,
 * and either one on its own is enough to call the screen answered.
 */
export async function saveDisplayName(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = DisplayNameSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "That name won't work - one to sixty letters." };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data })
    .eq("id", user.id);
  if (error) {
    console.error("saveDisplayName failed", { message: error.message });
    return { ok: false, error: "Couldn't save that. Try again." };
  }

  if (!(await markStep("identity")).ok) {
    return { ok: false, error: "Saved, but something stuck. Try again." };
  }
  return { ok: true };
}

/**
 * Move past a screen without answering it.
 *
 * Records that we asked and writes no profile data - which is exactly what
 * makes the profile page's nudge honest later: it reads the columns, not these
 * markers, so a skipped screen resurfaces there while never blocking the first
 * run again.
 */
export async function skipSetupStep(id: SetupStepId): Promise<MarkResult> {
  await requireUser();
  // Never trust a client-supplied step id - it goes straight into a row the
  // resolver reads back.
  if (!SETUP_STEPS.some((s) => s.id === id)) return { ok: false };
  // The quiz and the username are not skippable: one is the product, the other
  // is one-shot and the flow cannot proceed without it.
  if (id === "quiz" || id === "username") return { ok: false };

  return markStep(id);
}

/** Record a screen as answered without changing what it captured. */
export async function markSetupStep(id: SetupStepId): Promise<MarkResult> {
  await requireUser();
  if (!SETUP_STEPS.some((s) => s.id === id)) return { ok: false };
  return markStep(id);
}

/**
 * The taste quiz - the last screen. Runs the onboarding pipeline, then hands
 * off to the activation beat (#121) - the crafted first-answer moment - which
 * reveals one taste-derived pick and then leads into the map.
 */
export async function completeSetup(rawAnswers: QuizAnswers) {
  const user = await requireUser();
  const answers = AnswersSchema.parse(rawAnswers);
  const supabase = await createClient();

  await runOnboarding(supabase, user.id, answers);

  redirect("/welcome");
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
