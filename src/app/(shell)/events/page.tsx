import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveCity } from "@/lib/cities";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Reveal, RevealItem } from "@/components/motion/reveal";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Screen } from "@/components/app/screen";
import { formatEventTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage() {
  const profile = await requireOnboarded();
  const supabase = await createClient();
  const city = await resolveCity(supabase, profile.home_city);

  const since = new Date();
  since.setHours(since.getHours() - 6);
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("is_published", true)
    .gte("starts_at", since.toISOString())
    .order("starts_at", { ascending: true })
    .limit(30);

  const visibleCount = events?.length ?? 0;

  return (
    <Screen className="flex flex-col gap-10">
      <PageHeader
        eyebrow={`Events · ${city.name}`}
        title="What&rsquo;s actually on."
      />

      {visibleCount === 0 && (
        <EmptyState
          title="Quiet week, on paper."
          body="New events land as the curators find them. The good ones rarely announce themselves far ahead."
          action={
            <ButtonLink href="/map" variant="secondary">
              Explore the map instead
            </ButtonLink>
          }
        />
      )}

      {visibleCount > 0 && (
        <Reveal speed="fast">
        <ul className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
          {events!.map((event) => (
            <li key={event.id} className="h-full">
              <RevealItem className="h-full">
              <Link
                href={`/events/${event.id}`}
                className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-5 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-accent">
                    {formatEventTime(event.starts_at)}
                  </span>
                  {event.is_underground && (
                    <Badge variant="under">underground</Badge>
                  )}
                </div>
                <h2 className="font-display text-xl">{event.title}</h2>
                <p className="text-sm text-ink-dim">
                  {[event.venue_name, event.area].filter(Boolean).join(" · ")}
                </p>
                {event.vibe_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {event.vibe_tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                )}
              </Link>
              </RevealItem>
            </li>
          ))}
        </ul>
        </Reveal>
      )}
    </Screen>
  );
}
