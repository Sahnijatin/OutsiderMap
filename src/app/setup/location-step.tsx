"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getDevicePosition, hasLocationPermission } from "@/lib/map/geolocation";
import { markSetupStep, skipSetupStep } from "./actions";
import { SetupStepShell } from "./step-shell";

/**
 * The location primer - the one screen in the flow that asks the OS for
 * something rather than asking the member.
 *
 * It stores nothing. Not the coordinates: an onboarding fix is stale within
 * the hour and the map already takes a fresh one when it needs it, so keeping
 * it would be a standing privacy liability for no product value. Not a
 * "granted" flag either: that would be a lie the moment someone revokes the
 * permission in Settings, and the OS is the only honest source. The single
 * write is the step marker, which exists so we stop asking.
 *
 * Everything goes through the shared geolocation seam. That is what routes to
 * the Capacitor plugin on native - `navigator.geolocation` is unreliable in
 * the iOS WebView - and calling it is itself what raises the prompt on both
 * platforms.
 */
export function LocationStep() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const advanced = useRef(false);

  function advance() {
    if (advanced.current) return;
    advanced.current = true;
    startTransition(async () => {
      try {
        await markSetupStep("location");
      } catch {
        // Unlatch, or the button stays inert for the life of this mount and
        // the screen becomes a dead end - there is no column here to fall back
        // on the way home_area covers the city step.
        advanced.current = false;
        setNote("That didn't take. Try again.");
        return;
      }
      router.refresh();
    });
  }

  // Someone who already granted permission on the map has no reason to see
  // this screen at all.
  useEffect(() => {
    let cancelled = false;
    void hasLocationPermission().then((granted) => {
      if (!cancelled && granted) advance();
    });
    return () => {
      cancelled = true;
    };
    // advance is stable for this screen's lifetime (guarded by a ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask() {
    setAsking(true);
    setNote(null);
    try {
      await getDevicePosition({ timeoutMs: 10_000 });
      advance();
    } catch {
      // Denied, timed out, or unavailable - all the same outcome. Say it once,
      // move on, and never ask again from here.
      setNote(
        "The map opens on Delhi NCR instead. You can turn this on later from your phone's settings.",
      );
      setTimeout(advance, 1600);
    } finally {
      setAsking(false);
    }
  }

  function skip() {
    startTransition(async () => {
      await skipSetupStep("location");
      router.refresh();
    });
  }

  const busy = pending || asking;

  return (
    <SetupStepShell
      id="location"
      footer={
        <button
          type="button"
          onClick={skip}
          disabled={busy}
          className="text-sm text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          Not now
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <Button onClick={ask} disabled={busy} className="self-start">
          {asking ? <Spinner className="border-night/30 border-t-night" /> : null}
          Turn on location
        </Button>

        {/* Live region: the outcome of a permission prompt is otherwise
            invisible to a screen reader. */}
        <p className="text-sm text-ink-dim" aria-live="polite">
          {note}
        </p>
      </div>
    </SetupStepShell>
  );
}
