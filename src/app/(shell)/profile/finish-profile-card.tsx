"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  nudgeServerSnapshot,
  nudgeSnapshot,
  snoozeNudge,
  subscribeNudge,
} from "@/lib/setup/nudge";
import type { SetupStepId } from "@/lib/setup/steps";

/**
 * "Finish your profile" - shown when a member's home area or their name and
 * photo are still missing.
 *
 * This exists because the new setup screens are skippable and were never shown
 * to anyone who signed up before they existed. Neither group is dragged back
 * through onboarding; they get an offer here instead, pointing at
 * /setup?fill=1, which runs only the screens still missing and returns here.
 *
 * The parent only renders this when something is genuinely missing, so the
 * card retires itself for good once the gaps are filled - the snooze below
 * only covers "not right now".
 */

const LABELS: Record<string, string> = {
  city: "where you go out from",
  identity: "your name and face",
};

export function FinishProfileCard({ missing }: { missing: SetupStepId[] }) {
  // Server and first client render agree on "not snoozed"; the stored value
  // applies right after hydration. Same shape as the sound preferences, and it
  // keeps this out of the server's hands entirely.
  const snoozed = useSyncExternalStore(
    subscribeNudge,
    nudgeSnapshot,
    nudgeServerSnapshot,
  );

  if (snoozed || missing.length === 0) return null;

  const what = missing
    .map((id) => LABELS[id])
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="om-rise-in rounded-card border border-line bg-raise/40 p-4">
      <p className="voice">unfinished</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">
        We still don&rsquo;t know {what}. It takes a minute, and the map gets
        sharper the moment we do.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Link
          href="/setup?fill=1"
          className="rounded-full border border-accent/40 px-3 py-1 text-xs text-accent transition-colors hover:border-accent"
        >
          Finish it
        </Link>
        <button
          type="button"
          onClick={() => snoozeNudge()}
          className="text-xs text-ink-dim transition-colors hover:text-ink"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
