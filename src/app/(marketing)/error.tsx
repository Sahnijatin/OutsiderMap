"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * (marketing) error boundary: keeps the marketing nav and footer standing
 * when a page fails. No raw error text - the digest goes to the console.
 */
export default function MarketingError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Marketing route error", error.digest ?? error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-3xl flex-col items-center justify-center gap-5 px-5 text-center">
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
          Open the map
        </Link>
      </div>
    </main>
  );
}
