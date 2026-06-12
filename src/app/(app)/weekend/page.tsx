import type { Metadata } from "next";
import Link from "next/link";
import { isPremium, requireOnboarded } from "@/lib/auth";
import { nextFriday } from "@/lib/plans/weekend";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { NewPlanForm } from "./new-plan-form";

export const metadata: Metadata = {
  title: "Weekend",
};

const TEASE_ROWS = [
  { day: "FRI", text: "20:00 · a courtyard dinner that unwinds the week" },
  { day: "SAT", text: "13:00 · the long lunch → gallery → basement gig arc" },
  { day: "SUN", text: "11:30 · repair brunch, then a bookshop you'll close" },
];

export default async function WeekendPage() {
  const profile = await requireOnboarded();

  if (!(await isPremium())) {
    return (
      <main className="flex flex-col gap-10">
        <header className="flex flex-col gap-2">
          <p className="voice">Weekend planner · premium</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Three days, <span className="italic text-under">already decided.</span>
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-ink-dim">
            The planner reads your taste profile and composes Friday evening
            to Sunday night — your energy curve, your budget, your corners of
            the city. Editable down to the brunch table.
          </p>
        </header>

        <div className="relative overflow-hidden rounded-card border border-under/30 bg-surface p-7">
          <div className="halo-under absolute inset-0" />
          <div className="relative flex flex-col gap-3">
            {TEASE_ROWS.map((row) => (
              <div
                key={row.day}
                className="flex items-center gap-4 rounded-lg border border-line bg-night px-4 py-3"
              >
                <span className="font-mono text-xs text-under">{row.day}</span>
                <span className="text-sm text-ink blur-[5px] select-none">
                  {row.text}
                </span>
              </div>
            ))}
          </div>
          <div className="relative mt-6 flex items-center gap-4">
            <ButtonLink href="/pricing" variant="under">
              Unlock with premium
            </ButtonLink>
            <span className="font-mono text-xs text-ink-dim">
              ₹499/month · cancel anytime
            </span>
          </div>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("weekend_plans")
    .select("id, title, weekend_start, status, items, created_at")
    .eq("user_id", profile.id)
    .order("weekend_start", { ascending: false })
    .limit(20);

  return (
    <main className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <p className="voice">Weekend planner</p>
        <h1 className="font-display text-3xl sm:text-4xl">
          The weekend of {formatDay(new Date(`${nextFriday()}T12:00:00+05:30`))}.
        </h1>
      </header>

      <NewPlanForm defaultWeekend={nextFriday()} />

      {plans && plans.length > 0 && (
        <section className="flex flex-col gap-4">
          <p className="voice">Your weekends</p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {plans.map((plan) => {
              const count = Array.isArray(plan.items) ? plan.items.length : 0;
              return (
                <li key={plan.id}>
                  <Link
                    href={`/weekend/${plan.id}`}
                    className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-5 transition-colors hover:border-ink-dim"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-display text-xl">{plan.title}</h2>
                      <Badge variant={plan.status === "final" ? "under" : "outline"}>
                        {plan.status}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs text-ink-dim">
                      {formatDay(new Date(`${plan.weekend_start}T12:00:00+05:30`))} ·{" "}
                      {count} stops
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
