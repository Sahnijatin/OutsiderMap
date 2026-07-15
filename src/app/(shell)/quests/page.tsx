import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Quests" };

/** Sprint 2 surface. The weekend planner is the ancestor - point there. */
export default function QuestsStubPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
      <div className="halo absolute inset-0" />
      <p className="voice relative">in the workshop</p>
      <h1 className="relative max-w-sm font-display text-3xl italic">
        Your city, as a quest line.
      </h1>
      <p className="relative max-w-sm text-sm text-ink-dim">
        Step-by-step quests with capture guides and a reel at the end are
        landing soon. The weekend planner is the early version.
      </p>
      <ButtonLink href="/weekend" className="relative mt-2">
        Plan a weekend
      </ButtonLink>
    </main>
  );
}
