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
import type { MarketRunPlan } from "@/lib/market/types";

export const metadata: Metadata = { title: "Shopping runs" };

const STATUS_LABEL: Record<string, string> = {
  draft: "draft",
  active: "planned",
  completed: "done",
  abandoned: "dropped",
};

export default async function MarketRunsPage() {
  await requireOnboarded();
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("market_runs")
    .select("id, city, status, created_at, budget_max, plan")
    .order("created_at", { ascending: false })
    .limit(30);

  const list = runs ?? [];

  return (
    <Screen>
      <PageHeader eyebrow="shopping runs" title="Your market game-plans." />

      <div className="mt-6 flex flex-col gap-3">
        {list.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No shopping runs yet."
            body={
              <>
                Tell the chat where you&apos;re headed -
                &ldquo;going Sarojini tomorrow for a jacket and cargos,
                ₹3k&rdquo; - and it builds a lane-by-lane game-plan with honest
                price bands.
              </>
            }
            action={
              <ButtonLink href="/chat" variant="secondary">
                Ask the chat
              </ButtonLink>
            }
          />
        ) : (
          <Reveal speed="fast">
            <ul className="mt-2 flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
              {list.map((run) => {
                const plan = run.plan as unknown as MarketRunPlan | null;
                const name = plan?.marketName ?? "Shopping run";
                const verdict = plan?.budgetVerdict;
                return (
                  <li key={run.id}>
                    <RevealItem>
                      <Link
                        href={`/market-run/${run.id}`}
                        className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-display text-lg italic">
                            {name}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-dim">
                            {run.budget_max
                              ? `₹${run.budget_max}/head`
                              : "no budget set"}
                            {verdict && verdict !== "unknown"
                              ? ` · ${verdict}`
                              : ""}
                          </p>
                        </div>
                        <Badge
                          variant={
                            run.status === "active"
                              ? "accent"
                              : run.status === "completed"
                                ? "under"
                                : "outline"
                          }
                        >
                          {STATUS_LABEL[run.status] ?? run.status}
                        </Badge>
                      </Link>
                    </RevealItem>
                  </li>
                );
              })}
            </ul>
          </Reveal>
        )}
      </div>
    </Screen>
  );
}
