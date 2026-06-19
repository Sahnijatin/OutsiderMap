"use client";

// Catches errors thrown by the root layout/template itself (fonts, metadata,
// Analytics) — the segment-level error.tsx boundary cannot. This file replaces
// the root layout when active, so it must define its own <html>/<body> and
// pull in global styles. See node_modules/next/dist/docs/01-app/03-api-reference
// /03-file-conventions/error.md (global-error.jsx).

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
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
    <html lang="en">
      <body>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="voice">Something broke</p>
          <h1 className="font-display text-4xl">Not you. Us.</h1>
          <p className="max-w-sm text-sm text-ink-dim">
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="rounded-full border border-line px-5 py-2 text-sm text-ink transition-colors hover:border-ink-dim"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
