import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Screen } from "@/components/app/screen";
import { QuestWizard } from "./wizard";

export const metadata: Metadata = { title: "New quest" };

/**
 * Quest creation as a conversation: the concierge asks one question at a
 * time, city first. Live cities are selectable; roadmap cities show greyed
 * with a "soon". ?city= and ?brief= arrive from the chat handoff.
 */
export default async function NewQuestPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; brief?: string }>;
}) {
  const profile = await requireOnboarded();
  const supabase = await createClient();
  const { city, brief } = await searchParams;

  const { data: cities } = await supabase
    .from("cities")
    .select("slug, name, is_live")
    .order("is_live", { ascending: false })
    .order("name");

  return (
    <Screen width="narrow" className="relative">
      <div className="halo absolute inset-x-0 top-0 h-72" />
      <QuestWizard
        cities={cities ?? []}
        homeCity={profile.home_city}
        initialCity={city ?? null}
        initialBrief={brief ?? null}
      />
    </Screen>
  );
}
