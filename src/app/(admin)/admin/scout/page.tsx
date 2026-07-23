import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import {
  getAreaDensity,
  listResolvableBounties,
  recentVerificationAudit,
} from "@/lib/scout/admin";
import { resolveBountyAction, createDiscoverBountyAction } from "./actions";

export const metadata: Metadata = { title: "Admin · Scout" };

/**
 * Scout spot-audit (#114): oversight over bounties, confirmations, and the
 * points ledger, plus the two cold-start levers — per-area validator DENSITY
 * instrumentation and the admin-verification FALLBACK that resolves bounties a
 * thin area can't. Density and the resolve/create RPCs guard on is_admin(), so
 * they run through the admin's session client; bulk reads use the service role.
 */
export default async function ScoutAudit() {
  await requireAdmin();
  const admin = createAdminClient();
  const supabase = await createClient();

  const [
    density,
    bounties,
    { data: confirmations },
    { data: ledger },
    { data: cities },
    audit,
  ] = await Promise.all([
    getAreaDensity(supabase),
    listResolvableBounties(admin),
    admin
      .from("quest_confirmations")
      .select("id, bounty_id, verdict, geo_ok, independence_ok, anomaly, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("points_ledger").select("delta, status").limit(1000),
    admin.from("cities").select("slug, name").order("name"),
    recentVerificationAudit(admin),
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

  const confs = confirmations ?? [];
  const cityList = cities ?? [];
  const thinCities = density.filter((d) => d.thin).length;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-ink">Scout economy</h1>
        <span className="voice">
          ledger: {confirmed} confirmed · {escrow} escrow · {clawed} clawed back
        </span>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="voice">validator density by city</h2>
          <span className="text-xs text-ink-dim">
            {thinCities > 0
              ? `${thinCities} thin — admin verification recommended`
              : "coverage healthy"}
          </span>
        </div>
        {density.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-dim">
            No bounties with a city yet — nothing to measure.
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {density.map((d) => (
              <li key={d.city}>
                <Card className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="font-mono text-xs text-ink-dim">{d.city}</span>
                  <span className="flex items-center gap-2 text-xs text-ink-dim">
                    <span>{d.openBounties} open</span>
                    <span>·</span>
                    <span>{d.activeValidators} eligible validators</span>
                    {d.thin ? (
                      <Badge variant="under">thin · use fallback</Badge>
                    ) : (
                      <Badge variant="accent">quorum-capable</Badge>
                    )}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="voice">bounties awaiting resolution</h2>
        <p className="text-xs text-ink-dim">
          Resolving (anomalies held) surfaces first. Where an area is too thin to
          form an independent quorum, resolve by hand — every fallback is logged
          below with the density at decision time.
        </p>
        {bounties.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-dim">
            No open or held bounties.
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {bounties.map((b) => (
              <li key={b.id}>
                <Card className="flex flex-col gap-3 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-ink-dim">
                      {b.type} · {b.area ?? b.city ?? "—"} · +{b.bounty_points} pts
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
                  </div>
                  <form
                    action={resolveBountyAction}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  >
                    <input type="hidden" name="bounty_id" value={b.id} />
                    <Input
                      type="text"
                      name="note"
                      placeholder="Audit note (optional)"
                      maxLength={500}
                      className="h-9 py-1.5 text-sm sm:flex-1"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        name="decision"
                        value="publish"
                        variant="primary"
                        size="sm"
                      >
                        Publish
                      </Button>
                      <Button
                        type="submit"
                        name="decision"
                        value="reject"
                        variant="danger"
                        size="sm"
                      >
                        Reject
                      </Button>
                    </div>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="voice">create a discover bounty</h2>
        <Card className="p-4">
          <form
            action={createDiscoverBountyAction}
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <Field label="City" htmlFor="discover-city" className="sm:flex-1">
              <Select id="discover-city" name="city" defaultValue="" required>
                <option value="" disabled>
                  Select a city
                </option>
                {cityList.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Area" htmlFor="discover-area" className="sm:flex-1">
              <Input
                id="discover-area"
                name="area"
                type="text"
                placeholder="e.g. Shahpur Jat"
              />
            </Field>
            <Field label="Points" htmlFor="discover-points" className="sm:w-28">
              <Input
                id="discover-points"
                name="bounty_points"
                type="number"
                min={0}
                max={1000}
                defaultValue={20}
              />
            </Field>
            <Button type="submit" size="sm" className="h-11">
              Create
            </Button>
          </form>
        </Card>
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

      <section className="flex flex-col gap-3">
        <h2 className="voice">admin-verification fallback log</h2>
        {audit.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-dim">
            No admin resolutions yet.
          </Card>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {audit.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5",
                      a.decision === "publish"
                        ? "bg-raise text-ink-dim"
                        : "bg-danger/15 text-danger",
                    )}
                  >
                    {a.decision}
                  </span>
                  {a.note && <span className="text-ink-dim">{a.note}</span>}
                </span>
                <span className="font-mono text-ink-dim">
                  {a.active_validators ?? 0} eligible validators
                </span>
              </li>
            ))}
          </ul>
        )}
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
