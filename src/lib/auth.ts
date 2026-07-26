import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
 * The (app) gate: must be signed in, have claimed a username, and have
 * finished the taste quiz. /setup walks through whichever steps are missing.
 */
export async function requireOnboarded() {
  const profile = await getProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.username || !profile.onboarding_completed_at) {
    redirect("/setup");
  }
  return profile;
}

export async function requireAdmin() {
  const profile = await getProfile();
  if (!profile) redirect("/sign-in");
  if (!profile.is_admin) redirect("/map");
  return profile;
}
