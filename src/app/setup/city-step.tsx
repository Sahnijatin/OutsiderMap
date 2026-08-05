"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { saveHome, skipSetupStep } from "./actions";
import { SetupStepShell } from "./step-shell";

/**
 * Where the member actually lives.
 *
 * `profiles.home_city` has defaulted to 'delhi' since migration 9 and
 * `home_area` has been null for everyone, while recommendations, chat, map
 * search and quest generation all read them as though the member had chosen.
 * This is the screen that makes that true.
 *
 * Areas come from `cities.areas` - the ~70 real NCR names the catalog uses -
 * rather than a list invented here, so what a member picks is a value the rest
 * of the system already understands.
 */
export function CityStep({
  cities,
  initialCity,
  initialArea,
}: {
  cities: { slug: string; name: string; areas: string[] }[];
  initialCity: string | null;
  initialArea: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [city, setCity] = useState(
    () => cities.find((c) => c.slug === initialCity)?.slug ?? cities[0]?.slug,
  );
  const [area, setArea] = useState<string | null>(initialArea);

  const current = cities.find((c) => c.slug === city);
  const areas = current?.areas ?? [];
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? areas.filter((a) => a.toLowerCase().includes(needle))
    : areas;

  function save() {
    if (!city || !area) return;
    setError(null);
    startTransition(async () => {
      const result = await saveHome({ city, area });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The server component re-renders into the next step.
      router.refresh();
    });
  }

  function skip() {
    startTransition(async () => {
      await skipSetupStep("city");
      router.refresh();
    });
  }

  return (
    <SetupStepShell
      id="city"
      footer={
        <button
          type="button"
          onClick={skip}
          disabled={pending}
          className="text-sm text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          Skip for now
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Only one city is live today, so this reads as a confirmation rather
            than a choice - and quietly becomes a real picker the moment a
            second city goes live, with no code change. */}
        {cities.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {cities.map((c) => (
              <button
                key={c.slug}
                type="button"
                aria-pressed={c.slug === city}
                onClick={() => {
                  setCity(c.slug);
                  setArea(null);
                }}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors",
                  c.slug === city
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface text-ink-dim hover:border-ink-dim hover:text-ink",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          current && (
            <p className="text-sm text-ink-dim">
              <span className="text-ink">{current.name}</span> for now. More
              cities later.
            </p>
          )
        )}

        <div className="flex flex-col gap-3">
          <label htmlFor="area-filter" className="sr-only">
            Find your area
          </label>
          <Input
            id="area-filter"
            autoComplete="off"
            placeholder="Find your area…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <div
            className="flex max-h-64 flex-wrap gap-2 overflow-y-auto overscroll-contain"
            role="group"
            aria-label="Areas"
          >
            {shown.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={a === area}
                onClick={() => setArea(a)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm transition-colors",
                  a === area
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface text-ink-dim hover:border-ink-dim hover:text-ink",
                )}
              >
                {a}
              </button>
            ))}
            {shown.length === 0 && (
              <p className="text-sm text-ink-dim">
                Nothing by that name. Pick the closest one instead.
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button onClick={save} disabled={pending || !area} className="self-start">
          {pending ? (
            <Spinner className="border-night/30 border-t-night" />
          ) : null}
          That&rsquo;s my patch
        </Button>
      </div>
    </SetupStepShell>
  );
}
