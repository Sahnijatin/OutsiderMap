import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Returns the signed-in auth user, or null.
 *
 * Memoized per request. A layout, its page and any streamed section below it
 * all gate on this, and each call was a round trip to Supabase Auth - three or
 * four of them stacked in front of the first byte on the admin pages alone.
 * React's `cache` collapses them into one for the life of the request.
 */
export const getUser = cache(async function getUser() {
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
});

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

/** The caller's profile row, memoized per request alongside getUser(). */
export const getProfile = cache(async function getProfile(): Promise<
  Tables<"profiles"> | null
> {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data;
});

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
