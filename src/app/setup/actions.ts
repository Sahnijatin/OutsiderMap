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
import { verifyDateOfBirth } from "@/lib/consent/age";
import { recordConsent, recordConsents } from "@/lib/consent/record";
import {
  withdrawablePurposes,
  type ConsentPurpose,
} from "@/lib/consent/purposes";

export type ClaimResult =
  | { ok: true; claimed?: string }
  | { ok: false; error: string };

export type NoticeResult = { ok: true } | { ok: false; error: string };

/**
 * Step 0 of /setup: the DPDP notice, the age gate, and itemized consent.
 *
 * This is the collection point the whole compliance story hangs off. Before
 * it, a member signed in and the quiz started - no notice, no age check, and
 * no artifact recording what anyone agreed to.
 *
 * Order is deliberate: the date of birth is settled FIRST, through the RPC
 * that computes the age server-side, and consent is only recorded if an adult
 * came back. Recording consent rows for a 15-year-old and then blocking them
 * would leave us holding exactly the child's data the Act tells us not to
 * process.
 */
export async function acceptNotice(input: {
  dateOfBirth: string;
  purposes: Record<string, boolean>;
}): Promise<NoticeResult> {
  const user = await requireUser();
  const supabase = await createClient();

  // The date of birth is one-shot, so this has to be re-entrant: a previous
  // attempt may have saved it and then failed on the consent write. Skip
  // straight to the consent it is missing rather than raising "already
  // recorded" and looping.
  const { data: existing } = await supabase
    .from("profiles")
    .select("date_of_birth, blocked_at")
    .eq("id", user.id)
    .maybeSingle();

  if (existing?.blocked_at) redirect("/blocked");

  if (!existing?.date_of_birth) {
    const verdict = verifyDateOfBirth(input.dateOfBirth ?? "", Date.now());
    if (!verdict.ok && verdict.reason !== "underage") {
      return {
        ok: false,
        error:
          verdict.reason === "future"
            ? "That date is in the future."
            : verdict.reason === "implausible"
              ? "That date doesn't look right."
              : "Enter your date of birth as YYYY-MM-DD.",
      };
    }

    const { data, error } = await supabase.rpc("set_date_of_birth", {
      p_dob: input.dateOfBirth,
    });
    if (error) {
      console.error("set_date_of_birth failed", { message: error.message });
      return { ok: false, error: "Couldn't save that. Try again." };
    }

    const outcome = Array.isArray(data) ? data[0] : data;
    if (!outcome?.adult) redirect("/blocked");
  }

  // Adult, verified. Now the itemized consent - essential LAST, deliberately.
  //
  // Recording essential is what stamps policy_version_accepted, which is what
  // clears the gate. Do it first and a failure on any later purpose leaves the
  // member through the door with their optional choices unrecorded, silently
  // defaulting to refused, and never asked again. Doing it last means a
  // partial failure leaves the gate closed and they simply see this screen
  // again.
  const entries: Array<{ purpose: ConsentPurpose; granted: boolean }> = [
    ...withdrawablePurposes().map((spec) => ({
      purpose: spec.purpose,
      granted: input.purposes?.[spec.purpose] === true,
    })),
    { purpose: "essential", granted: true },
  ];

  const { errors } = await recordConsents(supabase, entries, "signup", {
    step: "setup_notice",
  });
  if (errors.length > 0) {
    console.error("acceptNotice consent write failed", { errors });
    return { ok: false, error: "Couldn't save your choices. Try again." };
  }

  return { ok: true };
}

/**
 * Re-accepting after a material policy change.
 *
 * Only the essential purpose is restamped: the member's existing per-purpose
 * choices are theirs and survive a policy revision. Silently re-granting
 * everything under a new version would turn "we updated our policy" into a
 * consent reset, which is the opposite of what §6 is for.
 */
export async function acceptReconsent(): Promise<NoticeResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await recordConsent(supabase, {
    purpose: "essential",
    granted: true,
    method: "reconsent",
    source: { step: "setup_reconsent", user: user.id },
  });
  if (error) {
    console.error("acceptReconsent failed", { message: error });
    return { ok: false, error: "Couldn't save that. Try again." };
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

/**
 * Step 2 of /setup: the taste quiz. Runs the onboarding pipeline, then hands
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
