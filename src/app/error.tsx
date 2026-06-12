"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="voice">Something broke</p>
      <h1 className="font-display text-4xl">Not you. Us.</h1>
      <p className="max-w-sm text-sm text-ink-dim">
        The page hit an error. Trying again usually fixes it.
      </p>
      <Button variant="secondary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
