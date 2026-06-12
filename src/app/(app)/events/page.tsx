import type { Metadata } from "next";
import Link from "next/link";
import { isPremium, requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { formatEventTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage() {
  await requireOnboarded();
  const premium = await isPremium();
  const supabase = await createClient();

  // RLS already scopes this to the viewer's tier.
  const since = new Date();
  since.setHours(since.getHours() - 6);
  const sinceIso = since.toISOString();
  const [{ data: events }, teasers] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("is_published", true)
      .gte("starts_at", sinceIso)
      .order("starts_at", { ascending: true })
      .limit(30),
    premium
      ? Promise.resolve(null)
      : supabase.rpc("event_teasers").then(({ data }) => data),
  ]);

  const visibleCount = events?.length ?? 0;
  const teaserCount = teasers?.length ?? 0;

  return (
    <main className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <p className="voice">Events · Delhi</p>
        <h1 className="font-display text-3xl sm:text-4xl">
          What&rsquo;s actually on.
        </h1>
      </header>

      {visibleCount === 0 && teaserCount === 0 && (
        <div className="rounded-card border border-line bg-surface p-10 text-center">
          <p className="font-display text-xl">Quiet week, on paper.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-dim">
            New events land as the curators find them. The good ones rarely
            announce themselves far ahead.
          </p>
        </div>
      )}

      {visibleCount > 0 && (
        <ul className="flex flex-col gap-4">
          {events!.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5 transition-colors hover:border-ink-dim"
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
            </li>
          ))}
        </ul>
      )}

      {teaserCount > 0 && (
        <section className="flex flex-col gap-4">
          <p className="voice">Locked · premium</p>
          <ul className="flex flex-col gap-3">
            {teasers!.map((teaser) => (
              <li
                key={teaser.id}
                className="relative overflow-hidden rounded-card border border-under/30 bg-surface p-5"
              >
                <div className="halo-under absolute inset-0" />
                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-xs text-under">
                      {formatEventTime(teaser.starts_at)}
                      {teaser.area ? ` · ${teaser.area}` : ""}
                    </span>
                    <span
                      aria-hidden
                      className="font-display text-xl text-ink blur-[6px] select-none"
                    >
                      Somebody&rsquo;s basement, somebody&rsquo;s list
                    </span>
                    <span className="sr-only">
                      A locked underground event — premium members see the
                      details.
                    </span>
                    {teaser.vibe_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {teaser.vibe_tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="under">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="size-5 shrink-0 text-under"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="4" y="11" width="16" height="9" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4">
            <ButtonLink href="/pricing" variant="under" size="sm">
              Unlock the underground
            </ButtonLink>
            <span className="font-mono text-xs text-ink-dim">
              {teaserCount} locked {teaserCount === 1 ? "event" : "events"} coming up
            </span>
          </div>
        </section>
      )}
    </main>
  );
}
