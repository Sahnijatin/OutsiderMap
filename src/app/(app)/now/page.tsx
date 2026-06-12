import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Right now",
};

// Placeholder — the full Right Now surface lands in Phase 3.
export default function NowPage() {
  return (
    <main className="flex flex-col items-center gap-4 py-24 text-center">
      <p className="voice">Right now mode</p>
      <h1 className="font-display text-3xl">Almost open.</h1>
      <p className="max-w-sm text-sm text-ink-dim">
        The ask-anything surface is being wired up. Your taste profile is
        ready and waiting on it.
      </p>
    </main>
  );
}
