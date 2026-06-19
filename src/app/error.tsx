"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="voice">Something broke</p>
      <h1 className="font-display text-4xl">Not you. Us.</h1>
      <p className="max-w-sm text-sm text-ink-dim">
        The page hit an error. Trying again usually fixes it.
      </p>
      <Button variant="secondary" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </main>
  );
}
