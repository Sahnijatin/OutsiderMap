import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { OnboardingQuiz } from "@/app/onboarding/quiz";
import { completeSetup } from "./actions";
import { UsernameStep } from "./username-step";

export const metadata: Metadata = {
  title: "Become an outsider",
};

/**
 * First-run flow: claim a username (one shot), then the taste quiz.
 * Fully set-up members get bounced straight to the map.
 */
export default async function SetupPage() {
  const profile = await getProfile();
  if (!profile) redirect("/sign-in");

  if (profile.username && profile.onboarding_completed_at) {
    redirect("/map");
  }

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="halo absolute inset-0" />
      {!profile.username ? (
        <UsernameStep outsiderNumber={profile.outsider_number} />
      ) : (
        <OnboardingQuiz action={completeSetup} />
      )}
    </main>
  );
}
