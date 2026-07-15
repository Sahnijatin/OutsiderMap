"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const INTERESTS = [
  "food",
  "history",
  "art",
  "music",
  "quiet corners",
  "markets",
  "nightlife",
  "crafts",
];

const HOURS = [
  { value: 3, label: "a few hours" },
  { value: 5, label: "half a day" },
  { value: 9, label: "the whole day" },
];

const BUDGETS = [
  { value: 1, label: "broke" },
  { value: 2, label: "sensible" },
  { value: 3, label: "treat myself" },
  { value: 4, label: "no ceiling" },
];

export function NewQuestForm() {
  const router = useRouter();
  const [firstTime, setFirstTime] = useState<boolean | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [hours, setHours] = useState(5);
  const [budget, setBudget] = useState<number | null>(null);
  const [brief, setBrief] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(v: string) {
    setInterests((prev) =>
      prev.includes(v) ? prev.filter((i) => i !== v) : [...prev, v].slice(0, 6),
    );
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_time: firstTime === true,
          interests,
          hours,
          budget_max: budget ?? undefined,
          brief: brief.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { questId?: string; message?: string };
      if (!res.ok || !body.questId) {
        throw new Error(body.message ?? "Quest generation failed.");
      }
      router.push(`/quests/${body.questId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Quest generation failed.",
      );
      setPending(false);
    }
  }

  if (pending) {
    return (
      <div className="relative z-10 flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
        <Spinner className="size-6" />
        <p className="voice">plotting your route</p>
        <p className="max-w-xs text-sm text-ink-dim">
          Reading your taste, picking the stops, writing the shot list.
          Twenty seconds or so.
        </p>
      </div>
    );
  }

  return (
    <div className="relative z-10 flex flex-col gap-8 pt-2">
      <div>
        <p className="voice">new quest</p>
        <h1 className="mt-1 font-display text-3xl italic">
          Three questions, one day.
        </h1>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-dim">
          Do you know this city?
        </legend>
        <div className="flex gap-2">
          <Chip
            active={firstTime === true}
            onClick={() => setFirstTime(true)}
          >
            First time here
          </Chip>
          <Chip
            active={firstTime === false}
            onClick={() => setFirstTime(false)}
          >
            I live here / know it
          </Chip>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-dim">
          What pulls you? Pick a few.
        </legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <Chip
              key={i}
              active={interests.includes(i)}
              onClick={() => toggleInterest(i)}
            >
              {i}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-dim">How long have you got?</legend>
        <div className="flex gap-2">
          {HOURS.map((h) => (
            <Chip
              key={h.value}
              active={hours === h.value}
              onClick={() => setHours(h.value)}
            >
              {h.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-dim">Money mood?</legend>
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map((b) => (
            <Chip
              key={b.value}
              active={budget === b.value}
              onClick={() => setBudget(budget === b.value ? null : b.value)}
            >
              {b.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-ink-dim">
          Anything else? (optional)
        </span>
        <Textarea
          rows={2}
          maxLength={400}
          placeholder="e.g. my sister's visiting and she's vegetarian"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
      </label>

      <Button onClick={submit} disabled={firstTime === null}>
        Build my quest
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition-colors",
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-line bg-surface text-ink-dim hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
