import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getQuestDetail } from "@/lib/quests/machine";
import { signQuestMediaUrls } from "@/lib/media/quest";
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
    <main className="mx-auto min-h-dvh max-w-lg pb-[calc(var(--tab-clearance)+2rem)] pt-[var(--safe-top)]">
      <QuestRun initial={quest} />
    </main>
  );
}
