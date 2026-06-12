import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Admin · Signals",
};

type QueryPayload = { query?: string };

export default async function AdminDashboard() {
  await requireAdmin();
  // Cross-user reads need the service role; RLS scopes the anon client to
  // the admin's own rows.
  const admin = createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceIso = since.toISOString();

  const [
    placesPublished,
    placesDraft,
    submissions,
    eventsUpcoming,
    usersOnboarded,
    premiumActive,
    recentEvents,
  ] = await Promise.all([
    admin
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    admin
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("is_published", false)
      .eq("source", "curated"),
    admin
      .from("places")
      .select("id", { count: "exact", head: true })
      .eq("source", "submitted")
      .eq("is_published", false),
    admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("starts_at", new Date().toISOString()),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("onboarding_completed_at", "is", null),
    admin
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .eq("tier", "premium")
      .eq("status", "active"),
    admin
      .from("interaction_events")
      .select("event_type, place_id, payload, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const events = recentEvents.data ?? [];
  const queries = events.filter((e) => e.event_type === "query");
  const saves = events.filter((e) => e.event_type === "save");
  const dismisses = events.filter((e) => e.event_type === "dismiss");
  const saveRate =
    queries.length > 0
      ? `${Math.round((saves.length / queries.length) * 100)}%`
      : "—";

  const queryCounts = new Map<string, number>();
  for (const event of queries) {
    const q = (event.payload as QueryPayload | null)?.query
      ?.toLowerCase()
      .trim();
    if (q) queryCounts.set(q, (queryCounts.get(q) ?? 0) + 1);
  }
  const topQueries = [...queryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const savedPlaceCounts = new Map<string, number>();
  for (const event of saves) {
    if (event.place_id) {
      savedPlaceCounts.set(
        event.place_id,
        (savedPlaceCounts.get(event.place_id) ?? 0) + 1,
      );
    }
  }
  const topSavedIds = [...savedPlaceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const { data: topPlaces } = topSavedIds.length
    ? await admin
        .from("places")
        .select("id, name, area")
        .in(
          "id",
          topSavedIds.map(([id]) => id),
        )
    : { data: [] };
  const placeName = new Map((topPlaces ?? []).map((p) => [p.id, p]));

  const stats = [
    { label: "Published places", value: placesPublished.count ?? 0 },
    { label: "Draft places", value: placesDraft.count ?? 0 },
    { label: "Submissions waiting", value: submissions.count ?? 0 },
    { label: "Upcoming events", value: eventsUpcoming.count ?? 0 },
    { label: "Onboarded members", value: usersOnboarded.count ?? 0 },
    { label: "Premium active", value: premiumActive.count ?? 0 },
    { label: "Asks · 7d", value: queries.length },
    { label: "Save rate · 7d", value: saveRate },
    { label: "Dismissals · 7d", value: dismisses.length },
  ];

  return (
    <main className="flex flex-col gap-10">
      <h1 className="font-display text-3xl">Signals</h1>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex flex-col gap-1 p-5">
            <span className="font-mono text-2xl text-accent">
              {stat.value}
            </span>
            <span className="text-xs text-ink-dim">{stat.label}</span>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <h2 className="voice">Top asks · 7 days</h2>
          {topQueries.length === 0 ? (
            <p className="text-sm text-ink-dim">No queries yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topQueries.map(([query, count]) => (
                <li
                  key={query}
                  className="flex items-baseline justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-2.5"
                >
                  <span className="font-mono text-sm text-ink">{query}</span>
                  <span className="font-mono text-xs text-ink-dim">
                    ×{count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="voice">Most saved · 7 days</h2>
          {topSavedIds.length === 0 ? (
            <p className="text-sm text-ink-dim">No saves yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topSavedIds.map(([id, count]) => {
                const place = placeName.get(id);
                return (
                  <li
                    key={id}
                    className="flex items-baseline justify-between gap-4 rounded-lg border border-line bg-surface px-4 py-2.5"
                  >
                    <span className="text-sm text-ink">
                      {place?.name ?? "(deleted place)"}
                      {place?.area && (
                        <span className="text-ink-dim"> · {place.area}</span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-ink-dim">
                      ×{count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
