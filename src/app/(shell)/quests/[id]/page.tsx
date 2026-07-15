import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getQuestDetail } from "@/lib/quests/machine";
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
  const quest = await getQuestDetail(supabase, id);
  if (!quest) notFound();

  return (
    <main className="mx-auto min-h-dvh max-w-lg pb-24">
      <QuestRun initial={quest} />
    </main>
  );
}
