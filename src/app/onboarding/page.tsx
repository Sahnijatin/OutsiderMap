import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { OnboardingQuiz } from "./quiz";

export const metadata: Metadata = {
  title: "Your taste profile",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ redo?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/sign-in");
  const { redo } = await searchParams;
  // ?redo=1 lets an onboarded user retake the quiz from their profile.
  if (profile.onboarding_completed_at && !redo) redirect("/profile");

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="halo absolute inset-0" />
      <OnboardingQuiz />
    </main>
  );
}
