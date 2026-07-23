import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import type {
  BudgetVerdict,
  CategoryEstimate,
  MarketRunPlan,
  PriceBasis,
} from "@/lib/market/types";

export const metadata: Metadata = { title: "Shopping run" };

/** Honest label + colour for where a price came from. */
const BASIS: Record<PriceBasis, { label: string; variant: "accent" | "outline" | "under" }> = {
  corroborated: { label: "corroborated", variant: "accent" },
  band: { label: "from recent hauls", variant: "accent" },
  guide: { label: "playbook estimate", variant: "outline" },
  unknown: { label: "ask around", variant: "under" },
};

const VERDICT: Record<BudgetVerdict, { label: string; variant: "accent" | "outline" | "under" }> = {
  feasible: { label: "fits your budget", variant: "accent" },
  tight: { label: "tight - bargain well", variant: "outline" },
  over: { label: "over budget", variant: "under" },
  unknown: { label: "no budget set", variant: "outline" },
};

function priceText(estimate: CategoryEstimate): string {
  return estimate.priceBand
    ? `₹${estimate.priceBand.low}-${estimate.priceBand.high}`
    : "ask around";
}

export default async function MarketRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOnboarded();
  const { id } = await params;
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("market_runs")
    .select("id, status, created_at, budget_max, plan")
    .eq("id", id)
    .maybeSingle();
  if (!run) notFound();

  const plan = run.plan as unknown as MarketRunPlan | null;
  const stops = plan?.stops ?? [];
  const verdict = VERDICT[plan?.budgetVerdict ?? "unknown"];

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-[calc(var(--tab-clearance)+2rem)] pt-[calc(var(--safe-top)+1.5rem)] lg:max-w-2xl lg:px-8 lg:pt-12">
      <header>
        <p className="voice">shopping run</p>
        <h1 className="mt-1 font-display text-3xl italic lg:text-4xl">
          {plan?.marketName ?? "Shopping run"}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-dim">
          {run.budget_max ? <span>₹{run.budget_max}/head</span> : null}
          {plan?.estimatedLow != null && plan?.estimatedHigh != null ? (
            <span>
              · est. ₹{plan.estimatedLow}-{plan.estimatedHigh}
            </span>
          ) : null}
          <Badge variant={verdict.variant}>{verdict.label}</Badge>
        </div>
      </header>

      {stops.length === 0 ? (
        <p className="mt-8 text-sm leading-relaxed text-ink-dim">
          This run has no saved plan. Ask the chat to build one for a market
          you&apos;re headed to.
        </p>
      ) : (
        <ol className="mt-6 flex flex-col gap-3">
          {stops.map((stop, i) => (
            <li
              key={`${stop.section ?? "general"}-${i}`}
              className="rounded-card border border-line bg-surface p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg italic">
                  {stop.section ?? "General market"}
                </h2>
                {stop.specialization ? (
                  <span className="text-xs text-ink-dim">{stop.specialization}</span>
                ) : null}
              </div>
              <ul className="mt-3 flex flex-col gap-3">
                {stop.estimates.map((e) => {
                  const basis = BASIS[e.basis];
                  return (
                    <li key={e.category} className="border-t border-line/60 pt-3 first:border-0 first:pt-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="capitalize">{e.category}</span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums text-ink-dim">{priceText(e)}</span>
                          <Badge variant={basis.variant}>{basis.label}</Badge>
                        </span>
                      </div>
                      {e.bargainingNote ? (
                        <p className="mt-1 text-xs leading-relaxed text-ink-dim">
                          {e.bargainingNote}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {plan?.notes && plan.notes.length > 0 ? (
        <div className="mt-5 rounded-card border border-line/60 bg-raise/40 p-4">
          <p className="voice mb-2">worth knowing</p>
          <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink-dim">
            {plan.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-6 text-xs leading-relaxed text-ink-dim">
        Prices are honest ranges from recent data, not exact quotes - bargain
        well, and tell the chat what you paid so the next person&apos;s plan is
        sharper.
      </p>
    </main>
  );
}
