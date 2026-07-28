"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { tickHarvest } from "./actions";

type Progress = {
  runId: string;
  status: string;
  totalTasks: number;
  doneTasks: number;
  failedTasks: number;
  candidates: number;
} | null;

/**
 * Keeps the queue moving while an admin watches: each poll is also a
 * processing tick (Vercel can't run the whole harvest in one request, so
 * the page itself is the engine's heartbeat). Refreshes the server-rendered
 * candidate list as results land.
 */
export function HarvestProgress({ initial }: { initial: Progress }) {
  const [progress, setProgress] = useState<Progress>(initial);
  const router = useRouter();
  const ticks = useRef(0);

  useEffect(() => {
    if (!progress || progress.status !== "active") return;
    const timer = setInterval(async () => {
      try {
        const next = await tickHarvest();
        setProgress(next);
        ticks.current += 1;
        // Pull fresh candidates into the review list every few ticks, and
        // once more when the run completes.
        if (next?.status !== "active" || ticks.current % 3 === 0) {
          router.refresh();
        }
      } catch {
        // Transient tick failure - the next interval retries.
      }
    }, 7000);
    return () => clearInterval(timer);
  }, [progress?.status, progress?.runId, router, progress]);

  if (!progress) return null;
  const pct =
    progress.totalTasks > 0
      ? Math.round(((progress.doneTasks + progress.failedTasks) / progress.totalTasks) * 100)
      : 0;
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between text-sm">
        <span>
          {progress.status === "active" ? "Harvesting…" : "Harvest complete"}
        </span>
        <span className="font-mono text-xs text-ink-dim">
          {progress.doneTasks + progress.failedTasks}/{progress.totalTasks} tasks
          {progress.failedTasks > 0 ? ` (${progress.failedTasks} failed)` : ""} ·{" "}
          {progress.candidates} candidates
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raise">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.status === "active" && (
        <p className="mt-2 text-xs text-ink-dim">
          Keep this page open - it drives the queue. OSM tasks run one at a
          time out of politeness to the free server.
        </p>
      )}
    </div>
  );
}
