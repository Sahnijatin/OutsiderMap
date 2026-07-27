import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatEventTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin · Events",
};

export default async function AdminEventsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: events } = await admin
    .from("events")
    .select("id, title, venue_name, area, starts_at, is_underground, is_published")
    .order("starts_at", { ascending: false })
    .limit(200);

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl">Events</h1>
        <ButtonLink href="/admin/events/new" size="sm">
          New event
        </ButtonLink>
      </header>

      {(!events || events.length === 0) && (
        <p className="text-sm text-ink-dim">
          Nothing yet. The underground starts with the first entry.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {(events ?? []).map((event) => (
          <li key={event.id}>
            <Link
              href={`/admin/events/${event.id}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition-colors hover:border-ink-dim"
            >
              <span className="font-mono text-xs text-accent">
                {formatEventTime(event.starts_at)}
              </span>
              <span className="font-medium">{event.title}</span>
              <span className="text-sm text-ink-dim">
                {[event.venue_name, event.area].filter(Boolean).join(" · ")}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {event.is_underground && (
                  <Badge variant="under">underground</Badge>
                )}
                <Badge variant={event.is_published ? "accent" : "default"}>
                  {event.is_published ? "live" : "draft"}
                </Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
