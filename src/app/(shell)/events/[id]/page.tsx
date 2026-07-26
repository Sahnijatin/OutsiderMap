import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatEventTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { BackLink } from "@/components/app/back-link";
import { Screen } from "@/components/app/screen";

export const metadata: Metadata = {
  title: "Event",
};

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOnboarded();
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*, places (slug, name, area)")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (!event) notFound();

  return (
    <Screen className="flex flex-col gap-8">
      <BackLink fallbackHref="/events" label="Events" />
      <Link href="/events" className="voice transition-colors hover:text-ink">
        ← Events
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-accent">
            {formatEventTime(event.starts_at)}
            {event.ends_at ? ` - ${formatEventTime(event.ends_at)}` : ""}
          </span>
          {event.is_underground && <Badge variant="under">underground</Badge>}
        </div>
        <h1 className="font-display text-3xl sm:text-4xl">{event.title}</h1>
        <p className="text-sm text-ink-dim">
          {[event.venue_name, event.area].filter(Boolean).join(" · ")}
        </p>
      </header>

      {event.description && (
        <p className="text-base leading-relaxed text-ink-dim">
          {event.description}
        </p>
      )}

      {event.vibe_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {event.vibe_tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {event.ticket_url && (
          <ButtonLink
            href={event.ticket_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Tickets / RSVP
          </ButtonLink>
        )}
        {event.places && (
          <span className="text-sm text-ink-dim">
            at {event.places.name}
            {event.places.area ? `, ${event.places.area}` : ""}
          </span>
        )}
      </div>
    </Screen>
  );
}
