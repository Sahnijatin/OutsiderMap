"use client";

import { CheckCircle2, Play, Square } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { JobOutcome } from "./actions";

/**
 * Runs a batched job to completion, one batch per round trip.
 *
 * Vercel caps how long a single request may run, so a six-thousand-row import
 * cannot finish in one call. Rather than hide that, the runner leans into it:
 * it keeps firing batches until nothing is left, shows progress while it goes,
 * and can be stopped between batches. An operator can watch it work and walk
 * away without losing anything, because progress lives in the database.
 */
export function JobRunner({
  action,
  label,
  runningLabel,
  total,
  done: initialDone,
  unit,
}: {
  action: () => Promise<JobOutcome>;
  label: string;
  runningLabel: string;
  /** Total units of work, for the progress bar. Zero hides the bar. */
  total: number;
  done: number;
  unit: string;
}) {
  const [done, setDone] = useState(initialDone);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const [, startTransition] = useTransition();

  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  async function runToCompletion() {
    setRunning(true);
    setError(null);
    setFinished(false);
    stopRef.current = false;

    let guard = 0;
    // Hard ceiling so a job that stops making progress cannot spin forever.
    while (!stopRef.current && guard < 200) {
      guard += 1;
      const result = await action();

      if (result.error) {
        setError(result.error);
        break;
      }
      setNotes(result.notes);
      setDone((d) => d + result.processed);

      if (result.remaining === 0 || result.processed === 0) {
        setFinished(true);
        break;
      }
    }

    setRunning(false);
    // Pull fresh server-rendered counts once the run settles.
    startTransition(() => {});
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={running}
          onClick={() => void runToCompletion()}
        >
          {running ? (
            <Spinner className="border-night/30 border-t-night" />
          ) : (
            <Play className="size-4" />
          )}
          {running ? runningLabel : label}
        </Button>

        {running && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              stopRef.current = true;
            }}
          >
            <Square className="size-3.5" />
            Stop after this batch
          </Button>
        )}

        {finished && !running && (
          <span className="inline-flex items-center gap-1.5 text-xs text-accent">
            <CheckCircle2 className="size-4" />
            Done
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-raise">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-dim">
            {done.toLocaleString()} of {total.toLocaleString()} {unit} ({pct}%)
          </p>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-ink-dim">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
    </div>
  );
}
