import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
    <main className="relative mx-auto min-h-dvh max-w-lg px-5 pb-[calc(var(--tab-clearance)+2rem)] pt-[calc(var(--safe-top)+1.5rem)] lg:max-w-2xl lg:pt-12">
      <div className="halo absolute inset-x-0 top-0 h-72" />
      <QuestWizard
        cities={cities ?? []}
        homeCity={profile.home_city}
        initialCity={city ?? null}
        initialBrief={brief ?? null}
      />
    </main>
  );
}
