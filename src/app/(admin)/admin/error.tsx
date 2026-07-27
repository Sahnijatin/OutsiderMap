"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Admin error boundary: a failed console page keeps the admin tabs standing.
 * No raw error text - the digest goes to the console for log matching.
 */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Admin route error", error.digest ?? error);
  }, [error]);

  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="voice">Something broke</p>
      <h1 className="font-display text-3xl italic">Not you. Us.</h1>
      <p className="max-w-sm text-sm text-ink-dim">
        This admin page hit an error. Trying again usually fixes it.
      </p>
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Link href="/admin" className="text-sm text-ink-dim hover:text-ink">
          Admin home
        </Link>
      </div>
    </div>
  );
}
