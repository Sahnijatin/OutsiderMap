import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuestDetail } from "@/lib/quests/machine";
import { signQuestMediaUrls } from "@/lib/media/quest";
import { Screen } from "@/components/app/screen";
import { QuestRun } from "./quest-run";

export const metadata: Metadata = { title: "Quest" };

export default async function QuestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOnboarded();
  const { id } = await params;
  const supabase = await createClient();
  const quest = await getQuestDetail(supabase, id, (paths) =>
    signQuestMediaUrls(createAdminClient(), paths),
  );
  if (!quest) notFound();

  return (
    // Full-bleed within a centered column: the quest run owns its horizontal
    // padding (media rows bleed to the edge), so only the safe-area offsets
    // come from the container.
    <Screen
      inset={false}
      className="mx-auto max-w-xl pb-[calc(var(--tab-clearance)+2rem)] pt-[var(--safe-top)]"
    >
      <QuestRun initial={quest} />
    </Screen>
  );
}
