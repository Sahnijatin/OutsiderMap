import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { evaluateGate } from "@/lib/consent/gate";
import type { Tables } from "@/types/database";

/** Returns the signed-in auth user, or null. */
export async function getUser() {
  // Public pages call this too - render signed-out rather than crash when
  // Supabase isn't configured (preview builds without env vars).
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Anon-tolerant user read for the anonymous-explore paths (#116): the same as
 * getUser(), named to make intent explicit at call sites that render for both
 * signed-in and signed-out visitors. Returns null when signed out.
 */
export async function getOptionalUser() {
  return getUser();
}

/** Redirects to /sign-in when not authenticated. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function getProfile(): Promise<Tables<"profiles"> | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data;
}

/**
 * The (app) gate: must be signed in, be a verified adult, have claimed a
 * username, have finished the taste quiz, and have accepted the current
 * privacy notice. /setup walks through whichever steps are missing.
 *
 * The branching lives in evaluateGate() so it can be unit-tested; this is the
 * only place that turns a step into a redirect. (shell)/layout.tsx calls this,
 * so one function covers every member surface and src/proxy.ts stays out of
 * it - the age gate needs no new protected prefix.
 */
/**
 * Which setup step a profile is at.
 *
 * Lives here rather than being called inline in /setup because reading the
 * clock during a component render is impure - React 19 rejects it, and the
 * lint rule is right that a render which depends on the time is a render that
 * can disagree with itself. Server-side, this is the module that owns "what is
 * this member allowed to do", so the clock read belongs here.
 */
export async function gateStep(
  profile: Pick<
    Tables<"profiles">,
    | "username"
    | "onboarding_completed_at"
    | "age_verified_at"
    | "blocked_at"
    | "date_of_birth"
    | "policy_version_accepted"
  >,
) {
  return evaluateGate(profile, Date.now());
}

export async function requireOnboarded() {
  const profile = await getProfile();
  if (!profile) redirect("/sign-in");

  switch (await gateStep(profile)) {
    case "blocked":
      redirect("/blocked");
    case "age":
    case "username":
    case "quiz":
      redirect("/setup");
    case "reconsent":
      redirect("/setup?reconsent=1");
    case "ok":
      break;
  }
  return profile;
}

export async function requireAdmin() {
  const profile = await getProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/map");
  return profile;
}
