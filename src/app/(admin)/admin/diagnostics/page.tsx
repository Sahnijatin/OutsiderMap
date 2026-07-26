import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Diagnostics · Admin" };

/**
 * Founder-facing production truth: which env vars are configured (booleans
 * only, never values) and what's actually in the database. This is the
 * "is prod seeded / why is a feature dead" page, readable from a phone.
 */

type EnvCheck = { name: string; ok: boolean; breaks: string };

export default async function DiagnosticsPage() {
  let env: ReturnType<typeof serverEnv> | null = null;
  let envError: string | null = null;
  try {
    env = serverEnv();
  } catch (err) {
    envError = err instanceof Error ? err.message : String(err);
  }

  const checks: EnvCheck[] = env
    ? [
        {
          name: "SUPABASE_SERVICE_ROLE_KEY",
          ok: !!env.SUPABASE_SERVICE_ROLE_KEY,
          breaks: "crons, ingest, seeding",
        },
        {
          name: "OPENAI_API_KEY",
          ok: !!env.OPENAI_API_KEY,
          breaks: "embeddings: chat, quests, Right Now, seeding",
        },
        {
          name: "ANTHROPIC_API_KEY",
          ok: !!env.ANTHROPIC_API_KEY,
          breaks: "chat + quest generation (AI_PROVIDER=anthropic)",
        },
        {
          name: "CRON_SECRET",
          ok: !!env.CRON_SECRET,
          breaks: "ingest sweeps, nightly recompute",
        },
        {
          name: "NEXT_PUBLIC_APP_URL",
          ok: !!env.NEXT_PUBLIC_APP_URL,
          breaks: "absolute links in email and share flows",
        },
        {
          name: "UPSTASH_REDIS_REST_URL",
          ok: !!env.UPSTASH_REDIS_REST_URL,
          breaks: "rate limiting (fails open without)",
        },
        {
          name: "RESEND_API_KEY",
          ok: !!env.RESEND_API_KEY,
          breaks: "transactional email",
        },
      ]
    : [];

  const admin = createAdminClient();

  const [
    cities,
    placesPublished,
    placesUnpublished,
    placesNoImage,
    events,
    queuedIngest,
    members,
    quests,
  ] = await Promise.all([
    admin.from("cities").select("slug, is_live"),
    admin
      .from("places")
      .select("city", { count: "exact", head: false })
      .eq("is_published", true),
    admin
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("is_published", false),
    admin
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true)
      .is("image_path", null),
    admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("starts_at", new Date().toISOString()),
    admin
      .from("ingest_items")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "fetching", "needs_review"]),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("quests").select("status"),
  ]);

  const placesPerCity = new Map<string, number>();
  for (const p of placesPublished.data ?? []) {
    placesPerCity.set(p.city, (placesPerCity.get(p.city) ?? 0) + 1);
  }
  const questCounts = new Map<string, number>();
  for (const q of quests.data ?? []) {
    questCounts.set(q.status, (questCounts.get(q.status) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-display text-2xl italic">Environment</h2>
        {envError ? (
          <Card className="mt-3 border-danger/40 p-4">
            <p className="text-sm text-danger">
              serverEnv() is throwing - a variable fails validation:
            </p>
            <p className="mt-2 font-mono text-xs text-ink-dim">{envError}</p>
          </Card>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {checks.map((c) => (
              <li
                key={c.name}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs">{c.name}</span>
                <span className="flex items-center gap-2">
                  <span className="hidden text-xs text-ink-dim sm:inline">
                    {c.breaks}
                  </span>
                  <Badge variant={c.ok ? "accent" : "outline"}>
                    {c.ok ? "set" : "missing"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-display text-2xl italic">Catalog</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label="Cities (live)"
            value={`${(cities.data ?? []).filter((c) => c.is_live).length} / ${cities.data?.length ?? 0}`}
          />
          {[...placesPerCity.entries()].map(([city, n]) => (
            <Stat key={city} label={`Published places · ${city}`} value={String(n)} />
          ))}
          {placesPerCity.size === 0 && (
            <Stat label="Published places" value="0" alarm />
          )}
          <Stat
            label="Places missing image"
            value={String(placesNoImage.count ?? 0)}
            alarm={(placesNoImage.count ?? 0) > 0}
          />
          <Stat label="Draft places" value={String(placesUnpublished.count ?? 0)} />
          <Stat label="Upcoming events" value={String(events.count ?? 0)} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl italic">Activity</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Members" value={String(members.count ?? 0)} />
          <Stat
            label="Quests (active / completed)"
            value={`${questCounts.get("active") ?? 0} / ${questCounts.get("completed") ?? 0}`}
          />
          <Stat
            label="Ingest in flight"
            value={String(queuedIngest.count ?? 0)}
          />
        </div>
      </section>

      <p className="text-xs text-ink-dim">
        Empty catalog? Run the seed runbook in docs/RUNBOOK-prod.md.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  alarm = false,
}: {
  label: string;
  value: string;
  alarm?: boolean;
}) {
  return (
    <Card className={alarm ? "border-danger/40 p-4" : "p-4"}>
      <p className="voice">{label}</p>
      <p
        className={`mt-1 font-display text-2xl ${alarm ? "text-danger" : "text-ink"}`}
      >
        {value}
      </p>
    </Card>
  );
}
