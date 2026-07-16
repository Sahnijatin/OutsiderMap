"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type CityOption = { slug: string; name: string; is_live: boolean };

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

const STEPS = ["city", "knows", "interests", "hours", "budget", "brief"] as const;
type Step = (typeof STEPS)[number];

const PENDING_LINES = [
  "reading your taste",
  "picking the stops",
  "writing the shot list",
];

type Answers = {
  city?: string;
  first_time?: boolean;
  interests: string[];
  hours?: number;
  budget?: number | null;
  brief?: string;
};

/**
 * The quest questionnaire as a conversation: the concierge asks one
 * question at a time, answers collect above as chat bubbles (tap one to go
 * back and change it), and the city question always comes first - live
 * cities selectable, roadmap cities greyed with a "soon".
 */
export function QuestWizard({
  cities,
  homeCity,
  initialCity,
  initialBrief,
}: {
  cities: CityOption[];
  homeCity: string | null;
  initialCity: string | null;
  initialBrief: string | null;
}) {
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  const prefilledCity = useMemo(
    () => cities.find((c) => c.slug === initialCity && c.is_live)?.slug,
    [cities, initialCity],
  );

  const [answers, setAnswers] = useState<Answers>({
    city: prefilledCity,
    interests: [],
    brief: initialBrief?.slice(0, 400) ?? undefined,
  });
  const [step, setStep] = useState(prefilledCity ? 1 : 0);
  const [pending, setPending] = useState(false);
  const [pendingLine, setPendingLine] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cityName = (slug?: string) =>
    cities.find((c) => c.slug === slug)?.name ?? "your city";

  // Cycle the pending status lines for a little theater.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(
      () => setPendingLine((i) => (i + 1) % PENDING_LINES.length),
      2600,
    );
    return () => clearInterval(t);
  }, [pending]);

  function advance(patch: Partial<Answers>, from: Step) {
    const updated = { ...answers, ...patch };
    setAnswers(updated);
    const index = STEPS.indexOf(from);
    const go = () => setStep(index + 1);
    if (index === STEPS.length - 1) {
      void submit(updated);
    } else {
      setTimeout(go, reduced ? 0 : 220);
    }
  }

  async function submit(finalAnswers: Answers) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: finalAnswers.city,
          first_time: finalAnswers.first_time === true,
          interests: finalAnswers.interests,
          hours: finalAnswers.hours ?? 5,
          budget_max: finalAnswers.budget ?? undefined,
          brief: finalAnswers.brief?.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        questId?: string;
        message?: string;
      } | null;
      if (!res.ok || !body?.questId) {
        throw new Error(body?.message ?? "Quest generation failed.");
      }
      router.push(`/quests/${body.questId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Quest generation failed.");
      setPending(false);
    }
  }

  if (pending) {
    return (
      <div className="relative z-10 flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
        <Spinner className="size-6" />
        <AnimatePresence mode="wait">
          <motion.p
            key={pendingLine}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            className="voice"
          >
            {PENDING_LINES[pendingLine]}
          </motion.p>
        </AnimatePresence>
        <p className="max-w-xs text-sm text-ink-dim">
          Twenty seconds or so - quests are built one at a time.
        </p>
      </div>
    );
  }

  const answered = STEPS.slice(0, step);
  const current = STEPS[step];

  return (
    <div className="relative z-10 flex flex-col gap-6 pt-2">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="voice">new quest</p>
          <h1 className="mt-1 font-display text-3xl italic">
            Let&rsquo;s plot a day.
          </h1>
        </div>
        <div className="flex gap-1.5 pb-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1 w-5 rounded-full transition-colors",
                i <= step ? "bg-accent" : "bg-line",
              )}
            />
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {answered.map((s) => (
          <ExchangeRow
            key={s}
            question={questionFor(s, cityName(answers.city))}
            answer={answerLabel(s, answers, cities)}
            onEdit={() => setStep(STEPS.indexOf(s))}
          />
        ))}

        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-4"
          >
            <BotBubble>{questionFor(current, cityName(answers.city))}</BotBubble>

            {current === "city" && (
              <div className="flex flex-wrap gap-2">
                {cities.map((c) =>
                  c.is_live ? (
                    <Chip
                      key={c.slug}
                      active={answers.city === c.slug}
                      onClick={() => advance({ city: c.slug }, "city")}
                    >
                      {c.name}
                      {c.slug === homeCity ? " · home" : ""}
                    </Chip>
                  ) : (
                    <span
                      key={c.slug}
                      aria-disabled
                      className="cursor-not-allowed rounded-full border border-line/50 bg-surface/50 px-4 py-2 text-sm text-ink-dim/50"
                    >
                      {c.name} <span className="voice !text-[0.55rem]">soon</span>
                    </span>
                  ),
                )}
              </div>
            )}

            {current === "knows" && (
              <div className="flex flex-wrap gap-2">
                <Chip
                  active={answers.first_time === true}
                  onClick={() => advance({ first_time: true }, "knows")}
                >
                  First time here
                </Chip>
                <Chip
                  active={answers.first_time === false}
                  onClick={() => advance({ first_time: false }, "knows")}
                >
                  I live here / know it
                </Chip>
              </div>
            )}

            {current === "interests" && (
              <>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((i) => (
                    <Chip
                      key={i}
                      active={answers.interests.includes(i)}
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          interests: prev.interests.includes(i)
                            ? prev.interests.filter((x) => x !== i)
                            : [...prev.interests, i].slice(0, 6),
                        }))
                      }
                    >
                      {i}
                    </Chip>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  onClick={() => advance({}, "interests")}
                >
                  {answers.interests.length > 0 ? "That's me" : "Surprise me"}
                </Button>
              </>
            )}

            {current === "hours" && (
              <div className="flex flex-wrap gap-2">
                {HOURS.map((h) => (
                  <Chip
                    key={h.value}
                    active={answers.hours === h.value}
                    onClick={() => advance({ hours: h.value }, "hours")}
                  >
                    {h.label}
                  </Chip>
                ))}
              </div>
            )}

            {current === "budget" && (
              <div className="flex flex-wrap gap-2">
                {BUDGETS.map((b) => (
                  <Chip
                    key={b.value}
                    active={answers.budget === b.value}
                    onClick={() => advance({ budget: b.value }, "budget")}
                  >
                    {b.label}
                  </Chip>
                ))}
                <Chip
                  active={false}
                  onClick={() => advance({ budget: null }, "budget")}
                >
                  whatever it takes
                </Chip>
              </div>
            )}

            {current === "brief" && (
              <div className="flex flex-col gap-3">
                <Textarea
                  rows={3}
                  maxLength={400}
                  placeholder="e.g. my sister's visiting and she's vegetarian"
                  value={answers.brief ?? ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, brief: e.target.value }))
                  }
                />
                <div className="flex items-center gap-3">
                  <Button onClick={() => advance({}, "brief")}>
                    Build my quest
                  </Button>
                  {!answers.brief?.trim() && (
                    <button
                      type="button"
                      onClick={() => advance({ brief: undefined }, "brief")}
                      className="text-sm text-ink-dim transition-colors hover:text-ink"
                    >
                      Nothing else - go
                    </button>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-start gap-2">
                <p className="max-w-md rounded-card border border-danger/40 bg-danger/5 px-4 py-2.5 text-sm text-ink-dim">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => void submit(answers)}
                  className="rounded-full border border-accent/50 px-4 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
                >
                  Try again
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function questionFor(step: Step, cityName: string) {
  switch (step) {
    case "city":
      return "Where are we playing?";
    case "knows":
      return `Do you know ${cityName}?`;
    case "interests":
      return "What pulls you? Pick a few.";
    case "hours":
      return "How long have you got?";
    case "budget":
      return "Money mood?";
    case "brief":
      return "Anything else I should know?";
  }
}

function answerLabel(step: Step, answers: Answers, cities: CityOption[]) {
  switch (step) {
    case "city":
      return cities.find((c) => c.slug === answers.city)?.name ?? "-";
    case "knows":
      return answers.first_time ? "First time here" : "I know it";
    case "interests":
      return answers.interests.length > 0
        ? answers.interests.join(", ")
        : "surprise me";
    case "hours":
      return HOURS.find((h) => h.value === answers.hours)?.label ?? "-";
    case "budget":
      return answers.budget == null
        ? "whatever it takes"
        : (BUDGETS.find((b) => b.value === answers.budget)?.label ?? "-");
    case "brief":
      return answers.brief?.trim() || "nothing else";
  }
}

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[85%] self-start rounded-card border border-line/70 bg-surface px-4 py-2.5 text-sm leading-relaxed text-ink">
      {children}
    </p>
  );
}

function ExchangeRow({
  question,
  answer,
  onEdit,
}: {
  question: string;
  answer: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[85%] self-start rounded-card border border-line/40 bg-surface/60 px-4 py-2 text-sm text-ink-dim">
        {question}
      </p>
      <button
        type="button"
        onClick={onEdit}
        title="Change this answer"
        className="max-w-[85%] self-end rounded-card bg-raise px-4 py-2 text-left text-sm text-ink transition-colors hover:bg-raise/70"
      >
        {answer}
      </button>
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
