import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getScoutLeaderboard, getMyReputation } from "@/lib/scout/reputation";
import { PageHeader } from "@/components/app/page-header";
import { Screen } from "@/components/app/screen";

export const metadata: Metadata = { title: "Scout · Standings" };

/**
 * Member-facing reputation surface (#114): your own points / verified spots /
 * earned badges, and the top curators across the map. Cross-member rows come
 * from the scout_leaderboard RPC (public reputation columns only).
 */
export default async function LeaderboardPage() {
  const profile = await requireOnboarded();
  const supabase = await createClient();

  const [leaderboard, me] = await Promise.all([
    getScoutLeaderboard(supabase, 25),
    getMyReputation(supabase, profile.id),
  ]);

  return (
    <Screen width="narrow">
      <PageHeader
        className="mb-6"
        eyebrow="scout economy"
        title="Standings"
        lead={
          <>
            Points and badges for finding and verifying the map.{" "}
            <Link href="/quests/bounties" className="underline">
              Back to bounties
            </Link>
          </>
        }
      />

      <section className="rounded-xl border border-line p-4">
        <h2 className="voice">your standing</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="points" value={me.points} />
          <Stat label="pending" value={me.escrowed} muted />
          <Stat label="verified spots" value={me.verifiedSpots} />
          <Stat label="confirmations" value={me.confirmations} />
        </div>

        <div className="mt-4">
          <p className="voice">badges</p>
          {me.badges.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">
              None yet - verify spots and confirm others&apos; finds to earn your
              first.
            </p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {me.badges.map((b) => (
                <li key={b.id}>
                  <Badge variant="accent">{b.name}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <h2 className="voice">top curators</h2>
        {leaderboard.length === 0 ? (
          <p className="rounded-xl border border-line p-6 text-center text-sm text-ink-dim">
            No ranked curators yet. Be the first - every verified spot earns
            reputation.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {leaderboard.map((entry, i) => {
              const isMe = entry.userId === profile.id;
              return (
                <li
                  key={entry.userId}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-3",
                    isMe ? "border-accent/50 bg-accent/5" : "border-line",
                  )}
                >
                  <span className="w-6 text-center font-mono text-sm text-ink-dim">
                    {i + 1}
                  </span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-raise text-sm text-ink-dim">
                    {(entry.displayName ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {entry.displayName ?? "A curator"}
                      {isMe && (
                        <span className="ml-1 text-xs text-accent">you</span>
                      )}
                    </span>
                    <span className="block text-xs text-ink-dim">
                      {entry.verifiedSpots} verified spots
                    </span>
                  </span>
                  <span className="font-mono text-sm text-ink">
                    {entry.curatorScore}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Screen>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg bg-surface p-3">
      <p className={cn("font-display text-2xl", muted ? "text-ink-dim" : "text-ink")}>
        {value}
      </p>
      <p className="voice mt-0.5">{label}</p>
    </div>
  );
}
