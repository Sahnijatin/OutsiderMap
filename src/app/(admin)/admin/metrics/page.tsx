import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  getAcceptRate,
  getActivation,
  getAnswerAcceptRate,
  getDaily,
  getExperiment,
  getExperimentConfig,
  getFunnel,
  getReasonSource,
  getRetention,
} from "@/lib/metrics/queries";
import { ratePct, funnelShares, FUNNEL_LABELS } from "@/lib/metrics/format";
import { ONE_ANSWER_VS_LIST } from "@/lib/experiments/server";
import { toggleExperiment } from "./actions";

export const metadata: Metadata = { title: "Admin · Metrics" };

/**
 * North-star metrics (#120): Confident-Answer-Accept-Rate, the activation
 * funnel, and D1/D7/D30 retention - computed on demand by the metrics RPCs.
 * Called with the admin's session client so the is_admin() guard resolves.
 * The precise accept-rate (part 2a) joins answer_served→answer_accepted by
 * answer_id; the proxy (part 1: query + a positive action in a window) stays
 * alongside until the precise events accumulate. Part 2b adds the A/B harness:
 * an admin-toggleable experiment with per-variant accept-rate.
 */
export default async function MetricsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [
    answer,
    accept,
    activation,
    reasons,
    daily,
    funnel,
    retention,
    expConfig,
    expRows,
  ] =
    await Promise.all([
      getAnswerAcceptRate(supabase, 7),
      getAcceptRate(supabase, 7),
      getActivation(supabase, 30),
      getReasonSource(supabase, 7),
      getDaily(supabase, 30),
      getFunnel(supabase, 30),
      getRetention(supabase, 8),
      getExperimentConfig(supabase, ONE_ANSWER_VS_LIST),
      getExperiment(supabase, ONE_ANSWER_VS_LIST, 14),
    ]);

  const acceptPct = ratePct(accept.accepts, accept.asks);
  const answerPct = answer.served > 0 ? ratePct(answer.accepted, answer.served) : null;
  const activationPct =
    activation.served > 0 ? ratePct(activation.accepted, activation.served) : null;
  // The complement - the editor-note share - is how often members were served
  // the same blurb as everyone else. Degraded picks are excluded from both:
  // their reasons are static by construction, so counting them would let a
  // provider outage read as a personalization regression.
  const reasonTotal = reasons.model + reasons.editorNote;
  const ownReasonPct =
    reasonTotal > 0 ? ratePct(reasons.model, reasonTotal) : null;
  const ttfa =
    activation.avgTtfaSeconds != null
      ? activation.avgTtfaSeconds < 90
        ? `${activation.avgTtfaSeconds}s`
        : `${Math.round(activation.avgTtfaSeconds / 60)}m`
      : "-";

  // Rank variants by accept-rate to mark the leader (only once both have data).
  const expVariants = expRows.map((r) => ({
    ...r,
    pct: r.served > 0 ? ratePct(r.accepted, r.served) : 0,
  }));
  const withData = expVariants.filter((v) => v.served > 0);
  const leader =
    withData.length >= 2
      ? withData.reduce((a, b) => (b.pct > a.pct ? b : a)).variant
      : null;
  const today = daily.at(-1);
  const maxAsks = Math.max(1, ...daily.map((d) => d.asks));
  const shares = funnelShares(funnel);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl text-ink">Metrics</h1>
        <span className="voice">north star · funnel · retention</span>
      </header>

      {/* North-star tiles */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Answer-accept-rate · 7d"
          value={answerPct !== null ? `${answerPct}%` : "-"}
          sub={
            answerPct !== null
              ? `${answer.accepted}/${answer.served} answers`
              : "awaiting answer events"
          }
          muted={answerPct === null}
        />
        <Tile
          label="Accept-rate · proxy · 7d"
          value={`${acceptPct}%`}
          sub={`${accept.accepts}/${accept.asks} asks`}
        />
        <Tile
          label="Active users · today"
          value={today?.activeUsers ?? 0}
        />
        <Tile
          label="First-answer accept · 30d"
          value={activationPct !== null ? `${activationPct}%` : "-"}
          sub={
            activationPct !== null
              ? `${activation.accepted}/${activation.served} activations`
              : "awaiting activations"
          }
          muted={activationPct === null}
        />
        <Tile
          label="Time to first answer"
          value={ttfa}
          sub={ttfa === "-" ? "awaiting activations" : "avg onboarding→answer"}
          muted={ttfa === "-"}
        />
        <Tile
          label="Own-reason rate · 7d"
          value={ownReasonPct !== null ? `${ownReasonPct}%` : "-"}
          sub={
            ownReasonPct !== null
              ? `${reasons.model}/${reasonTotal} picks${
                  reasons.degraded > 0 ? ` · ${reasons.degraded} degraded` : ""
                }`
              : "awaiting picks"
          }
          muted={ownReasonPct === null}
        />
        <Tile
          label="Stretch-success-rate"
          value="-"
          sub="pending the dial (#126)"
          muted
        />
      </section>

      {/* Experiment: one answer vs a list (#120 part 2b) */}
      {expConfig && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="voice">experiment · {expConfig.key}</h2>
            <form action={toggleExperiment}>
              <input type="hidden" name="key" value={expConfig.key} />
              <input
                type="hidden"
                name="enabled"
                value={(!expConfig.enabled).toString()}
              />
              <button
                type="submit"
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  expConfig.enabled
                    ? "bg-accent/15 text-accent hover:bg-accent/25"
                    : "bg-raise text-ink-dim hover:text-ink",
                )}
              >
                {expConfig.enabled ? "● running · turn off" : "○ off · turn on"}
              </button>
            </form>
          </div>
          <Card className="flex flex-col gap-3 p-4">
            {expConfig.description && (
              <p className="text-sm text-ink-dim">{expConfig.description}</p>
            )}
            <div className="flex flex-col gap-2">
              {expConfig.variants.map((name) => {
                const row = expVariants.find((v) => v.variant === name);
                const served = row?.served ?? 0;
                const accepted = row?.accepted ?? 0;
                const pct = row?.pct ?? 0;
                return (
                  <div
                    key={name}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="flex w-24 shrink-0 items-center gap-1.5 font-mono text-xs text-ink">
                      {name}
                      {leader === name && (
                        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[0.6rem] text-accent">
                          leading
                        </span>
                      )}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-sm bg-raise">
                      <div
                        className="flex h-full items-center rounded-sm bg-accent/80 px-2"
                        style={{ width: `${Math.max(pct, served > 0 ? 4 : 0)}%` }}
                      >
                        {served > 0 && (
                          <span className="text-xs font-medium text-night">
                            {pct}%
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="w-24 shrink-0 text-right font-mono text-xs text-ink-dim">
                      {accepted}/{served}
                    </span>
                  </div>
                );
              })}
            </div>
            {withData.length < 2 && (
              <p className="text-xs text-ink-dim">
                {expConfig.enabled
                  ? "Running - accept-rate per variant appears here as answers are served (14d)."
                  : "Turn on to split members across variants and compare accept-rate."}
              </p>
            )}
          </Card>
        </section>
      )}

      {/* Daily series */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="voice">daily · asks vs accepts · 30d</h2>
          <span className="flex items-center gap-3 text-xs text-ink-dim">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-accent" /> accepts
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-raise" /> asks
            </span>
          </span>
        </div>
        <Card className="p-4">
          {daily.every((d) => d.asks === 0) ? (
            <p className="py-8 text-center text-sm text-ink-dim">
              No asks in the last 30 days yet.
            </p>
          ) : (
            <div className="flex h-32 items-end gap-0.5">
              {daily.map((d) => (
                <div
                  key={d.day}
                  className="flex flex-1 flex-col justify-end"
                  title={`${d.day} · ${d.asks} asks · ${d.accepts} accepts · ${d.activeUsers} active`}
                >
                  <div
                    className="relative w-full rounded-sm bg-raise"
                    style={{ height: `${(d.asks / maxAsks) * 100}%` }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-sm bg-accent"
                      style={{ height: `${ratePct(d.accepts, d.asks)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Activation funnel */}
      <section className="flex flex-col gap-3">
        <h2 className="voice">activation funnel · new members · 30d</h2>
        <Card className="flex flex-col gap-2.5 p-4">
          {shares.map((s) => (
            <div key={s.stage} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-ink-dim">
                {FUNNEL_LABELS[s.stage] ?? s.stage}
              </span>
              <div className="h-5 flex-1 overflow-hidden rounded-sm bg-raise">
                <div
                  className="flex h-full items-center rounded-sm bg-accent/80 px-2"
                  style={{ width: `${Math.max(s.pct, 4)}%` }}
                >
                  <span className="text-xs font-medium text-night">{s.n}</span>
                </div>
              </div>
              <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-dim">
                {s.pct}%
              </span>
            </div>
          ))}
        </Card>
      </section>

      {/* Retention cohorts */}
      <section className="flex flex-col gap-3">
        <h2 className="voice">retention · by sign-up week · returned on/after day N</h2>
        {retention.length === 0 ? (
          <Card className="p-6 text-center text-sm text-ink-dim">
            No cohorts yet.
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-dim">
                  <th className="px-4 py-2 font-normal">Cohort</th>
                  <th className="px-4 py-2 font-normal">Size</th>
                  <th className="px-4 py-2 font-normal">D1</th>
                  <th className="px-4 py-2 font-normal">D7</th>
                  <th className="px-4 py-2 font-normal">D30</th>
                </tr>
              </thead>
              <tbody>
                {retention.map((c) => (
                  <tr key={c.cohortWeek} className="border-b border-line">
                    <td className="px-4 py-2 font-mono text-xs text-ink-dim">
                      {c.cohortWeek}
                    </td>
                    <td className="px-4 py-2 text-ink">{c.cohortSize}</td>
                    <RetentionCell n={c.d1} of={c.cohortSize} />
                    <RetentionCell n={c.d7} of={c.cohortSize} />
                    <RetentionCell n={c.d30} of={c.cohortSize} />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string | number;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <Card className="p-4">
      <p
        className={cn(
          "font-display text-3xl",
          muted ? "text-ink-dim" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="voice mt-1">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-dim">{sub}</p>}
    </Card>
  );
}

function RetentionCell({ n, of }: { n: number; of: number }) {
  const pct = ratePct(n, of);
  return (
    <td className="px-4 py-2">
      <span className="text-ink">{pct}%</span>
      <span className="ml-1 font-mono text-xs text-ink-dim">({n})</span>
    </td>
  );
}
