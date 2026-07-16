import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Quests" };

const STATUS_LABEL: Record<string, string> = {
  draft: "ready to start",
  active: "in progress",
  completed: "completed",
  abandoned: "abandoned",
};

export default async function QuestsPage() {
  await requireOnboarded();
  const supabase = await createClient();
  const { data: quests } = await supabase
    .from("quests")
    .select("id, title, city, status, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(30);

  const list = quests ?? [];

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-[calc(var(--tab-clearance)+2rem)] pt-[calc(var(--safe-top)+1.5rem)]">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="voice">quests</p>
          <h1 className="mt-1 font-display text-3xl italic">
            Your city, as a quest line.
          </h1>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-3">
        <ButtonLink href="/quests/new">Plan a new quest</ButtonLink>

        {list.length === 0 ? (
          <div className="relative mt-8 text-center">
            <div className="halo absolute -inset-8" />
            <p className="relative text-sm leading-relaxed text-ink-dim">
              No quests yet. Answer three questions and get a day built
              around your taste - stops unlock one at a time, like a game.
            </p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {list.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/quests/${q.id}`}
                  className="flex items-center justify-between gap-3 rounded-card border border-line/70 bg-surface p-4 transition-colors hover:border-accent/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg italic">
                      {q.title}
                    </p>
                    <p className="mt-0.5 text-xs capitalize text-ink-dim">
                      {q.city}
                    </p>
                  </div>
                  <Badge
                    variant={
                      q.status === "active"
                        ? "accent"
                        : q.status === "completed"
                          ? "under"
                          : "outline"
                    }
                  >
                    {STATUS_LABEL[q.status] ?? q.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
