import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reels" };

/** Sprint 4 surface. */
export default function ReelsStubPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
      <div className="halo absolute inset-0" />
      <p className="voice relative">soon</p>
      <h1 className="relative max-w-sm font-display text-3xl italic">
        Proof it happened.
      </h1>
      <p className="relative max-w-sm text-sm text-ink-dim">
        Finished quests become reels - your shots, your outsider number, no
        branding. This is where they&rsquo;ll live.
      </p>
    </main>
  );
}
