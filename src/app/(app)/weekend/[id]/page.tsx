import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isPremium, requireOnboarded } from "@/lib/auth";
import { PLAN_DAYS, StoredItemsSchema } from "@/lib/plans/weekend";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { deletePlan, moveItem, removeItem, setPlanStatus } from "../actions";

export const metadata: Metadata = {
  title: "Weekend plan",
};

const DAY_LABELS: Record<string, string> = {
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOnboarded();
  if (!(await isPremium())) notFound();
  const { id } = await params;

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("weekend_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!plan) notFound();

  const parsed = StoredItemsSchema.safeParse(plan.items);
  const items = parsed.success ? parsed.data : [];
  const editable = plan.status === "draft";

  async function move(formData: FormData) {
    "use server";
    await moveItem(
      String(formData.get("plan_id")),
      Number(formData.get("index")),
      Number(formData.get("dir")) === -1 ? -1 : 1,
    );
  }

  async function remove(formData: FormData) {
    "use server";
    await removeItem(
      String(formData.get("plan_id")),
      Number(formData.get("index")),
    );
  }

  async function toggleStatus(formData: FormData) {
    "use server";
    await setPlanStatus(
      String(formData.get("plan_id")),
      formData.get("status") === "final" ? "final" : "draft",
    );
  }

  async function destroy(formData: FormData) {
    "use server";
    await deletePlan(String(formData.get("plan_id")));
  }

  return (
    <main className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link
            href="/weekend"
            className="voice transition-colors hover:text-ink"
          >
            ← Weekends
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl">{plan.title}</h1>
          <p className="font-mono text-xs text-ink-dim">
            weekend of{" "}
            {formatDay(new Date(`${plan.weekend_start}T12:00:00+05:30`))}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={plan.status === "final" ? "under" : "outline"}>
            {plan.status}
          </Badge>
          <form action={toggleStatus}>
            <input type="hidden" name="plan_id" value={plan.id} />
            <input
              type="hidden"
              name="status"
              value={editable ? "final" : "draft"}
            />
            <button
              type="submit"
              className="text-sm text-ink-dim transition-colors hover:text-ink"
            >
              {editable ? "Lock it in" : "Reopen"}
            </button>
          </form>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {PLAN_DAYS.map((day) => {
          const dayItems = items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.day === day);
          return (
            <section key={day} className="flex flex-col gap-3">
              <h2 className="voice">{DAY_LABELS[day]}</h2>
              {dayItems.length === 0 && (
                <p className="rounded-card border border-dashed border-line p-5 text-sm text-ink-dim">
                  Nothing planned. A free {DAY_LABELS[day]} is also a plan.
                </p>
              )}
              {dayItems.map(({ item, index }, dayIndex) => (
                <article
                  key={`${item.place_slug}-${index}`}
                  className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5"
                >
                  <p className="font-mono text-xs text-accent">
                    {item.time} · {item.slot}
                  </p>
                  <h3 className="font-display text-lg">{item.place_name}</h3>
                  {item.area && (
                    <p className="font-mono text-xs text-ink-dim">{item.area}</p>
                  )}
                  <p className="text-sm leading-relaxed text-ink-dim">
                    {item.note}
                  </p>
                  {editable && (
                    <div className="mt-2 flex items-center gap-3 text-sm text-ink-dim">
                      {dayIndex > 0 && (
                        <form action={move}>
                          <input type="hidden" name="plan_id" value={plan.id} />
                          <input type="hidden" name="index" value={index} />
                          <input type="hidden" name="dir" value={-1} />
                          <button
                            type="submit"
                            aria-label="Move earlier"
                            className="transition-colors hover:text-ink"
                          >
                            ↑
                          </button>
                        </form>
                      )}
                      {dayIndex < dayItems.length - 1 && (
                        <form action={move}>
                          <input type="hidden" name="plan_id" value={plan.id} />
                          <input type="hidden" name="index" value={index} />
                          <input type="hidden" name="dir" value={1} />
                          <button
                            type="submit"
                            aria-label="Move later"
                            className="transition-colors hover:text-ink"
                          >
                            ↓
                          </button>
                        </form>
                      )}
                      <form action={remove}>
                        <input type="hidden" name="plan_id" value={plan.id} />
                        <input type="hidden" name="index" value={index} />
                        <button
                          type="submit"
                          className="transition-colors hover:text-danger"
                        >
                          Drop
                        </button>
                      </form>
                    </div>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <ButtonLink href="/weekend" variant="secondary" size="sm">
          Plan another weekend
        </ButtonLink>
        <form action={destroy}>
          <input type="hidden" name="plan_id" value={plan.id} />
          <button
            type="submit"
            className="text-sm text-ink-dim transition-colors hover:text-danger"
          >
            Delete this plan
          </button>
        </form>
      </footer>
    </main>
  );
}
