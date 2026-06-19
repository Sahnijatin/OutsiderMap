import { Reveal, RevealItem } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";

const lockedRows = [
  { name: "Courtyard listening session", meta: "South Delhi · Sat" },
  { name: "Supper club, eight seats", meta: "Mehrauli · Fri" },
  { name: "Basement gig, no poster", meta: "Shahpur Jat · tonight" },
];

export function Premium() {
  return (
    <section className="relative mx-auto max-w-5xl px-6 py-28">
      <div className="halo-under absolute inset-x-0 top-1/4 h-96" />
      <Reveal className="relative">
        <RevealItem>
          <p className="voice">When you want more</p>
        </RevealItem>
        <RevealItem>
          <h2 className="mt-4 max-w-2xl font-display text-3xl sm:text-5xl">
            The weekend, planned.{" "}
            <span className="italic text-under">The underground, open.</span>
          </h2>
        </RevealItem>

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          <RevealItem>
            <div className="flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-7">
              <Badge variant="under" className="self-start">
                Premium
              </Badge>
              <h3 className="font-display text-2xl">Weekend Planner</h3>
              <p className="text-sm leading-relaxed text-ink-dim">
                Friday evening to Sunday night, planned around your taste,
                your energy curve, and your budget - then editable down to
                the brunch table. Save it, share it, actually do it.
              </p>
              <div className="mt-auto flex flex-col gap-2 pt-4">
                {["FRI · slow start, loud finish", "SAT · the long one", "SUN · repair day"].map(
                  (row) => (
                    <div
                      key={row}
                      className="rounded-lg border border-line bg-night px-4 py-2.5 font-mono text-xs text-ink-dim"
                    >
                      {row}
                    </div>
                  ),
                )}
              </div>
            </div>
          </RevealItem>

          <RevealItem>
            <div className="flex h-full flex-col gap-4 rounded-card border border-under/30 bg-surface p-7">
              <Badge variant="under" className="self-start">
                Premium
              </Badge>
              <h3 className="font-display text-2xl">Underground access</h3>
              <p className="text-sm leading-relaxed text-ink-dim">
                Parties without posters. Supper clubs, listening bars,
                basement gigs - curated by people, not scraped from
                anywhere. If it&rsquo;s on Google, it doesn&rsquo;t count.
              </p>
              <div className="mt-auto flex flex-col gap-2 pt-4">
                {lockedRows.map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-night px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink blur-[5px] select-none">
                        {row.name}
                      </p>
                      <p className="font-mono text-xs text-ink-dim">
                        {row.meta}
                      </p>
                    </div>
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      className="size-4 shrink-0 text-under"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="4" y="11" width="16" height="9" rx="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          </RevealItem>
        </div>
      </Reveal>
    </section>
  );
}
