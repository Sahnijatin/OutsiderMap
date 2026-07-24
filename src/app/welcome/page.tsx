import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActivationReveal } from "./activation-reveal";

export const metadata: Metadata = { title: "Welcome" };

/**
 * The activation beat (#121): the once-only first-answer moment. Reached right
 * after onboarding. Gated so it fires exactly once — an already-activated
 * member (or anyone arriving here later) is sent straight into the app. `?redo`
 * lets us re-watch it in dev without resetting the flag.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ redo?: string }>;
}) {
  const user = await requireUser();
  const { redo } = await searchParams;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, onboarding_completed_at, activated_at, outsider_number")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/sign-in");
  // Finish onboarding first.
  if (!profile.username || !profile.onboarding_completed_at) redirect("/setup");
  // Already seen it → into the city (still gets the map's welcome toast once).
  if (profile.activated_at && redo !== "1") redirect("/map?welcome=1");

  return (
    <ActivationReveal
      username={profile.username}
      outsiderNumber={profile.outsider_number}
    />
  );
}
