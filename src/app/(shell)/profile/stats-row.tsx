"use client";

import { Counter } from "@/components/motion/counter";

/**
 * Four live numbers under the identity card. Counts are computed
 * server-side in page.tsx; this only animates them in.
 */
export function StatsRow({
  quests,
  saved,
  followers,
  following,
}: {
  quests: number;
  saved: number;
  followers: number;
  following: number;
}) {
  const stats = [
    { label: "quests done", value: quests },
    { label: "places saved", value: saved },
    { label: "followers", value: followers },
    { label: "following", value: following },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-card border border-line/70 bg-surface px-4 py-3"
        >
          <Counter
            value={s.value}
            className="font-display text-2xl text-accent"
          />
          <p className="voice mt-1 !text-[0.6rem]">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
