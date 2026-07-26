import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Screen } from "@/components/app/screen";

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
  const { data: quests, error: questsError } = await supabase
    .from("quests")
    .select("id, title, city, status, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(30);

  const list = quests ?? [];

  return (
    <Screen>
      <PageHeader
        eyebrow="quests"
        title="Your city, as a quest line."
        action={
          <ButtonLink href="/quests/new" className="hidden lg:inline-flex">
            Plan a new quest
          </ButtonLink>
        }
      />

      <Link
        href="/market-run"
        className="mt-4 flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <div className="min-w-0">
          <p className="font-display text-lg italic">Market shopping runs</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            Heading to a market? Get a lane-by-lane game-plan with honest prices.
          </p>
        </div>
        <span className="shrink-0 text-sm text-accent">→</span>
      </Link>

      <Link
        href="/quests/bounties"
        className="mt-3 flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <div className="min-w-0">
          <p className="font-display text-lg italic">Scout bounties</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            Verify hidden spots on-site, or list your own - earn points as the
            map grows.
          </p>
        </div>
        <span className="shrink-0 text-sm text-accent">→</span>
      </Link>

      <Link
        href="/quests/leaderboard"
        className="mt-3 flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <div className="min-w-0">
          <p className="font-display text-lg italic">Scout standings</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            Your points and badges, and the top curators on the map.
          </p>
        </div>
        <span className="shrink-0 text-sm text-accent">→</span>
      </Link>

      <div className="mt-6 flex flex-col gap-3">
        <ButtonLink href="/quests/new" className="lg:hidden">
          Plan a new quest
        </ButtonLink>

        {questsError ? (
          // A failed query is not an empty list - say so, and offer a retry.
          <EmptyState
            className="mt-4"
            title="Your quests didn't load."
            body="Something broke on our side. Give it a moment and try again."
            action={
              <ButtonLink href="/quests" variant="secondary">
                Try again
              </ButtonLink>
            }
          />
        ) : list.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No quests yet."
            body="Answer three questions and get a day built around your taste - stops unlock one at a time, like a game."
            action={
              <ButtonLink href="/quests/new">Plan your first quest</ButtonLink>
            }
          />
        ) : (
          <Reveal speed="fast">
            <ul className="mt-2 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
              {list.map((q) => (
                <li key={q.id}>
                  <RevealItem>
                    <Link
                      href={`/quests/${q.id}`}
                      className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
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
                  </RevealItem>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>
    </Screen>
  );
}
