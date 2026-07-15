import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { NewQuestForm } from "./new-quest-form";

export const metadata: Metadata = { title: "New quest" };

export default async function NewQuestPage() {
  await requireOnboarded();
  return (
    <main className="relative mx-auto min-h-dvh max-w-lg px-5 pb-24 pt-6">
      <div className="halo absolute inset-x-0 top-0 h-72" />
      <NewQuestForm />
    </main>
  );
}
