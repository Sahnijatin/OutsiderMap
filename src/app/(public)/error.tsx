"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Screen } from "@/components/app/screen";

/**
 * (public) error boundary: the map and place pages fail inside the public
 * shell, keeping the tabs and rail alive. No raw error text - the digest goes
 * to the console for matching against server logs.
 */
export default function PublicError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Public route error", error.digest ?? error);
  }, [error]);

  return (
    <Screen className="flex flex-col items-center justify-center gap-5 text-center">
      <p className="voice">Something broke</p>
      <h1 className="font-display text-3xl italic">Not you. Us.</h1>
      <p className="max-w-sm text-sm text-ink-dim">
        This page hit an error. Trying again usually fixes it.
      </p>
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Link href="/map" className="text-sm text-ink-dim hover:text-ink">
          Back to the map
        </Link>
      </div>
    </Screen>
  );
}
