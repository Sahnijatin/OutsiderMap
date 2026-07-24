import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { actOnCase } from "./actions";

export const metadata: Metadata = { title: "Admin · Moderation" };

const ACTIONS: { action: string; label: string }[] = [
  { action: "approve", label: "Approve" },
  { action: "remove", label: "Remove" },
  { action: "escalate", label: "Escalate" },
  { action: "warn", label: "Warn" },
  { action: "mute", label: "Mute" },
  { action: "ban", label: "Ban" },
];

type Assessment = { categories?: string[]; action?: string; confidence?: number } | null;

/** Severity-prioritized review queue: open cases needing a human decision. */
export default async function ModerationQueue() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: cases } = await admin
    .from("moderation_cases")
    .select(
      "id, target_type, target_id, author_id, source, decision, severity, assessment, reason, created_at",
    )
    .is("resolved_at", null)
    .order("severity", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(100);

  const list = cases ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-ink">Moderation queue</h1>
        <span className="voice">{list.length} open</span>
      </header>

      {list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-dim">
          Nothing waiting. Auto-decided and resolved cases drop off here.
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((c) => {
            const a = c.assessment as Assessment;
            return (
              <li key={c.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="rounded-full bg-raise px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-ink-dim">
                      {c.target_type}
                    </span>
                    <span className="text-ink">{c.decision}</span>
                    <span className="text-ink-dim">·</span>
                    <span className="text-ink-dim">severity {c.severity}</span>
                    <span className="text-ink-dim">·</span>
                    <span className="font-mono text-xs text-ink-dim">{c.source}</span>
                  </div>
                  {(a?.categories?.length || c.reason) && (
                    <p className="text-sm text-ink-dim">
                      {a?.categories?.length ? a.categories.join(", ") : ""}
                      {a?.categories?.length && c.reason ? " - " : ""}
                      {c.reason ?? ""}
                    </p>
                  )}
                  <p className="font-mono text-[0.65rem] text-ink-dim">
                    target {c.target_id}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ACTIONS.map((act) => (
                      <form key={act.action} action={actOnCase}>
                        <input type="hidden" name="case_id" value={c.id} />
                        <input type="hidden" name="action" value={act.action} />
                        <button
                          type="submit"
                          className="rounded-full border border-line px-3 py-1 text-xs text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
                        >
                          {act.label}
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
