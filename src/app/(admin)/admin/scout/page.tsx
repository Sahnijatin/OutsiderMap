import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Admin · Scout" };

/**
 * Scout spot-audit (#114): oversight over bounties, confirmations, and the
 * points ledger. Bounties held in 'resolving' (anomalies detected) surface
 * first for review; the ledger totals show provisional (escrow) vs confirmed.
 */
export default async function ScoutAudit() {
  await requireAdmin();
  const admin = createAdminClient();

  const [{ data: held }, { data: confirmations }, { data: ledger }] =
    await Promise.all([
      admin
        .from("bounty_quests")
        .select("id, type, area, city, status, quorum_needed, created_at")
        .in("status", ["resolving", "open"])
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("quest_confirmations")
        .select(
          "id, bounty_id, verdict, geo_ok, independence_ok, anomaly, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("points_ledger").select("delta, status").limit(1000),
    ]);

  const escrow = (ledger ?? [])
    .filter((r) => r.status === "escrow")
    .reduce((s, r) => s + r.delta, 0);
  const confirmed = (ledger ?? [])
    .filter((r) => r.status === "confirmed")
    .reduce((s, r) => s + r.delta, 0);
  const clawed = (ledger ?? [])
    .filter((r) => r.status === "clawed_back")
    .reduce((s, r) => s + r.delta, 0);

  const bounties = held ?? [];
  const confs = confirmations ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-ink">Scout economy</h1>
        <span className="voice">
          ledger: {confirmed} confirmed · {escrow} escrow · {clawed} clawed back
        </span>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="voice">bounties (resolving first)</h2>
        {bounties.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-dim">
            No open or held bounties.
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {bounties.map((b) => (
              <li key={b.id}>
                <Card className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="font-mono text-xs text-ink-dim">
                    {b.type} · {b.area ?? b.city ?? "—"}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      b.status === "resolving"
                        ? "bg-danger/15 text-danger"
                        : "bg-raise text-ink-dim",
                    )}
                  >
                    {b.status}
                    {b.status === "resolving" ? " · review anomalies" : ""}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="voice">recent confirmations</h2>
        <ul className="flex flex-col gap-1.5">
          {confs.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs"
            >
              <span className="text-ink">{c.verdict}</span>
              <Flag ok={c.geo_ok} label="geo" />
              <Flag ok={c.independence_ok} label="indep" />
              {c.anomaly && (
                <span className="rounded bg-danger/15 px-1.5 py-0.5 text-danger">
                  anomaly
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Flag({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5",
        ok ? "bg-raise text-ink-dim" : "bg-danger/15 text-danger",
      )}
    >
      {label}
      {ok ? " ✓" : " ✗"}
    </span>
  );
}
