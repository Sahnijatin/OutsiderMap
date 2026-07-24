"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { tap } from "@/lib/native/haptics";

/**
 * The way out of a detail screen.
 *
 * Phones have no browser chrome in the native shell and iOS has no hardware
 * back, so a screen without one of these is a dead end. Prefers real history
 * (so you land where you came from) and falls back to `fallbackHref` when the
 * screen was opened cold - a deep link, a notification tap, or a fresh launch.
 */
export function BackLink({
  fallbackHref,
  label = "Back",
  className,
}: {
  /** Where to go when there's no history to pop (deep link / cold open). */
  fallbackHref: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        tap();
        // history.length > 1 means something preceded us in this tab.
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={
        className ??
        "-ml-1 inline-flex items-center gap-1 rounded-full py-1 pr-2 text-sm text-ink-dim transition-colors hover:text-ink"
      }
    >
      <ChevronLeft className="size-4" />
      {label}
    </button>
  );
}
