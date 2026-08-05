import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { gateStep, getProfile } from "@/lib/auth";
import { adultBirthDateCutoff } from "@/lib/consent/clock";
import { OnboardingQuiz } from "./quiz";
import { acceptReconsent, completeSetup } from "./actions";
import { NoticeStep, ReconsentStep } from "./notice-step";
import { UsernameStep } from "./username-step";

export const metadata: Metadata = {
  title: "Become an outsider",
};

/**
 * First-run flow: the DPDP notice and age gate, then claim a username (one
 * shot), then the taste quiz. Fully set-up members get bounced to the map -
 * unless ?redo=1, which lets them retake the quiz from the profile page.
 *
 * The step is chosen by the same evaluateGate() that requireOnboarded() uses,
 * so the gate that redirects here and the page that renders the steps cannot
 * disagree - a disagreement between them is a redirect loop.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ redo?: string; reconsent?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/sign-in");
  const { redo } = await searchParams;

  const [step, maxBirthDate] = await Promise.all([
    gateStep(profile),
    adultBirthDateCutoff(),
  ]);
  // A direct hit on /setup does not pass through requireOnboarded(), so the
  // block is re-checked here rather than assumed.
  if (step === "blocked") redirect("/blocked");
  if (step === "ok" && !redo) redirect("/map");

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="halo absolute inset-0" />
      {step === "age" ? (
        <NoticeStep
          maxDate={maxBirthDate}
          dobRecorded={profile.date_of_birth != null}
        />
      ) : step === "reconsent" ? (
        <ReconsentStep action={acceptReconsent} />
      ) : step === "username" ? (
        <UsernameStep outsiderNumber={profile.outsider_number} />
      ) : (
        <OnboardingQuiz action={completeSetup} />
      )}
    </main>
  );
}
