import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Reveal, RevealItem } from "@/components/motion/reveal";
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
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-[calc(var(--tab-clearance)+2rem)] pt-[calc(var(--safe-top)+1.5rem)] lg:max-w-4xl lg:px-8 lg:pt-12">
      <header>
        <p className="voice">shopping runs</p>
        <h1 className="mt-1 font-display text-3xl italic lg:text-4xl">
          Your market game-plans.
        </h1>
      </header>

      <div className="mt-6 flex flex-col gap-3">
        {list.length === 0 ? (
          <div className="relative mt-8 text-center">
            <div className="halo absolute -inset-8" />
            <p className="relative mx-auto max-w-md text-sm leading-relaxed text-ink-dim">
              No shopping runs yet. Tell the chat where you&apos;re headed -
              &ldquo;going Sarojini tomorrow for a jacket and cargos, ₹3k&rdquo; -
              and it builds a lane-by-lane game-plan with honest price bands.
            </p>
          </div>
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
                        className="flex items-center justify-between gap-3 rounded-card border border-line/70 bg-surface p-4 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
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
    </main>
  );
}
