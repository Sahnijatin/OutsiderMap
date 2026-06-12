"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { QUIZ, type QuizAnswers } from "@/lib/taste/quiz";
import { completeOnboarding } from "./actions";

export function OnboardingQuiz() {
  const reduced = useReducedMotion() ?? false;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const question = QUIZ[step];
  const isLast = step === QUIZ.length - 1;
  const current = answers[question.id];

  function answer(value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  }

  function next(updated?: QuizAnswers) {
    if (isLast) {
      const finalAnswers = updated ?? answers;
      setError(null);
      startTransition(async () => {
        try {
          await completeOnboarding(finalAnswers);
        } catch {
          setError(
            "Something broke while saving. Your answers are safe — try again.",
          );
        }
      });
    } else {
      setStep((s) => s + 1);
    }
  }

  function pickSingle(value: string) {
    const updated = { ...answers, [question.id]: value };
    setAnswers(updated);
    // Auto-advance feels cinematic; tiny delay lets the selection register.
    setTimeout(() => next(updated), reduced ? 0 : 220);
  }

  function toggleMulti(value: string) {
    const list = Array.isArray(current) ? current : [];
    answer(
      list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    );
  }

  if (pending) {
    return (
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <Spinner className="size-6" />
        <p className="voice">Reading you</p>
        <p className="max-w-sm text-sm text-ink-dim">
          Building your taste profile — the structured read, the summary,
          the embedding. Twenty seconds, once.
        </p>
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-6 py-10">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg italic">OutsiderMap</span>
        <div className="flex gap-1.5" aria-label={`Question ${step + 1} of ${QUIZ.length}`}>
          {QUIZ.map((q, i) => (
            <span
              key={q.id}
              className={cn(
                "h-1 w-6 rounded-full transition-colors",
                i <= step ? "bg-accent" : "bg-line",
              )}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={reduced ? false : { opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? undefined : { opacity: 0, x: -32 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-1 flex-col justify-center gap-8 py-12"
        >
          <div className="flex flex-col gap-3">
            <p className="voice">{question.eyebrow}</p>
            <h1 className="font-display text-3xl sm:text-4xl">
              {question.title}
            </h1>
            {question.hint && (
              <p className="text-sm text-ink-dim">{question.hint}</p>
            )}
          </div>

          {question.kind === "single" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {question.options!.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => pickSingle(option.value)}
                  className={cn(
                    "rounded-card border p-5 text-left transition-colors",
                    current === option.value
                      ? "border-accent bg-accent/10"
                      : "border-line bg-surface hover:border-ink-dim",
                  )}
                >
                  <span className="block font-display text-lg">
                    {option.label}
                  </span>
                  {option.detail && (
                    <span className="mt-1 block text-sm text-ink-dim">
                      {option.detail}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {question.kind === "multi" && (
            <>
              <div className="flex flex-wrap gap-2.5">
                {question.options!.map((option) => {
                  const selected =
                    Array.isArray(current) && current.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleMulti(option.value)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition-colors",
                        selected
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-line bg-surface text-ink-dim hover:border-ink-dim hover:text-ink",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <Button
                onClick={() => next()}
                disabled={!Array.isArray(current) || current.length === 0}
                className="self-start"
              >
                Continue
              </Button>
            </>
          )}

          {question.kind === "text" && (
            <div className="flex flex-col gap-4">
              <Textarea
                autoFocus
                rows={5}
                placeholder="last friday: parathas at 1am in lajpat, then we sat on the car bonnet till 3 talking…"
                value={typeof current === "string" ? current : ""}
                onChange={(e) => answer(e.target.value)}
              />
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => next()}
                  disabled={
                    typeof current !== "string" || current.trim().length < 10
                  }
                >
                  Build my profile
                </Button>
                <span className="text-xs text-ink-dim">
                  The more honest, the better the answers.
                </span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </motion.div>
      </AnimatePresence>

      <div className="flex h-8 items-center">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="text-sm text-ink-dim transition-colors hover:text-ink"
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
