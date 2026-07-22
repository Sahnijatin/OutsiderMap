import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { slaStatus } from "@/lib/moderation/sla";
import { actOnGrievance } from "./actions";

export const metadata: Metadata = { title: "Admin · Grievances" };

function countdown(deadlineMs: number, nowMs: number): string {
  const diff = deadlineMs - nowMs;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const label = h >= 24 ? `${Math.floor(h / 24)}d` : `${h}h`;
  return diff >= 0 ? `${label} left` : `${label} overdue`;
}

/** Grievance Officer desk: open grievances with statutory SLA countdowns. */
export default async function GrievanceDesk() {
  await requireAdmin();
  const admin = createAdminClient();
  const now = new Date().getTime();

  const { data: grievances } = await admin
    .from("grievances")
    .select(
      "id, reporter_id, category, body, status, received_at, acknowledged_at, resolved_at, officer_id",
    )
    .not("status", "in", "(resolved,rejected)")
    .order("received_at", { ascending: true })
    .limit(100);

  const list = grievances ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-ink">Grievances</h1>
        <span className="voice">{list.length} open</span>
      </header>

      {list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-dim">
          No open grievances. Acknowledge within 24h, resolve within the
          statutory window.
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((g) => {
            const sla = slaStatus(g, now);
            return (
              <li key={g.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="rounded-full bg-raise px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-ink-dim">
                      {g.category}
                    </span>
                    <span className="text-ink">{g.status}</span>
                    <span
                      className={cn(
                        "text-xs",
                        sla.ackOverdue ? "text-danger" : "text-ink-dim",
                      )}
                    >
                      ack {countdown(sla.ackBy, now)}
                    </span>
                    <span
                      className={cn(
                        "text-xs",
                        sla.resolveOverdue ? "text-danger" : "text-ink-dim",
                      )}
                    >
                      resolve {countdown(sla.resolveBy, now)}
                    </span>
                  </div>
                  {g.body && <p className="text-sm text-ink-dim">{g.body}</p>}
                  <div className="flex flex-wrap gap-2">
                    {(["acknowledge", "resolve", "reject"] as const).map((action) => (
                      <form key={action} action={actOnGrievance}>
                        <input type="hidden" name="id" value={g.id} />
                        <input type="hidden" name="action" value={action} />
                        <button
                          type="submit"
                          className="rounded-full border border-line px-3 py-1 text-xs capitalize text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
                        >
                          {action}
                        </button>
                      </form>
                    ))}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
