import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { NewQuestForm } from "./new-quest-form";

export const metadata: Metadata = { title: "New quest" };

export default async function NewQuestPage() {
  await requireOnboarded();
  return (
    <main className="relative mx-auto min-h-dvh max-w-lg px-5 pb-[calc(var(--tab-clearance)+2rem)] pt-[calc(var(--safe-top)+1.5rem)] lg:max-w-2xl lg:pt-12">
      <div className="halo absolute inset-x-0 top-0 h-72" />
      <NewQuestForm />
    </main>
  );
}
