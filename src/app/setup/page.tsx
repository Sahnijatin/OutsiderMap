import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveSetupStep } from "@/lib/setup/flow";
import type { SetupStepId } from "@/lib/setup/steps";
import { OnboardingQuiz } from "./quiz";
import { completeSetup } from "./actions";
import { UsernameStep } from "./username-step";
import { CityStep } from "./city-step";
import { IdentityStep } from "./identity-step";
import { LocationStep } from "./location-step";

export const metadata: Metadata = {
  title: "Become an outsider",
};

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

/**
 * The first run: twelve screens, resolved one at a time from the profile row.
 *
 * Which screen to show is `resolveSetupStep`'s decision rather than this
 * page's - the rules (an onboarded member is done; ?redo=1 always means the
 * quiz; ?fill=1 runs only the gaps) are pure and pinned by
 * tests/setup/flow.test.ts, which they could not be if they lived here.
 *
 * Each screen advances by writing its answer and calling router.refresh(): the
 * server component re-renders and the resolver picks the next one. There is no
 * client-side step machine, which is why a refresh mid-flow always lands in the
 * right place.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ redo?: string; fill?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/sign-in");
  const { redo, fill } = await searchParams;

  const resolved = resolveSetupStep(profile, {
    redo: redo === "1",
    fill: fill === "1",
  });
  if (resolved.kind === "done") redirect(resolved.to);

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="halo absolute inset-0" />
      {await renderStep(resolved.step.id, profile)}
    </main>
  );
}

async function renderStep(id: SetupStepId, profile: Profile) {
  switch (id) {
    case "username":
      return <UsernameStep outsiderNumber={profile.outsider_number} />;

    case "city": {
      // Only live cities are offered: an area has to belong to a city the
      // catalog actually covers, or the map behind it is empty.
      const supabase = await createClient();
      const { data } = await supabase
        .from("cities")
        .select("slug, name, areas")
        .eq("is_live", true)
        .order("name");
      return (
        <CityStep
          cities={data ?? []}
          initialCity={profile.home_city}
          initialArea={profile.home_area}
        />
      );
    }

    case "identity":
      return (
        <IdentityStep
          initialName={profile.display_name}
          initialAvatarUrl={profile.avatar_url}
        />
      );

    case "location":
      return <LocationStep />;

    case "quiz":
      return <OnboardingQuiz action={completeSetup} userId={profile.id} />;
  }
}
