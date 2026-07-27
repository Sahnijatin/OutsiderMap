import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listNearbyBounties } from "@/lib/scout/bounties";
import { PageHeader } from "@/components/app/page-header";
import { Screen } from "@/components/app/screen";
import { ConfirmFlow, SubmitSpotForm } from "./bounty-client";

export const metadata: Metadata = { title: "Scout · Bounties" };

/**
 * The community/bounty side of Quests: submit hidden spots, and verify others'
 * on-site for points. Listings are blind (no lister shown). Eligibility to
 * confirm is enforced server-side when a verification is submitted.
 */
export default async function BountiesPage() {
  await requireOnboarded();
  const supabase = await createClient();
  const bounties = await listNearbyBounties(supabase, { limit: 50 });

  return (
    <Screen width="narrow">
      <PageHeader
        className="mb-6"
        eyebrow="scout economy"
        title="Verify the map. Earn your place on it."
        lead={
          <>
            Go to a listed spot, prove it exists with a live photo, and both
            you and the scout who found it earn points.{" "}
            <Link href="/quests/leaderboard" className="underline">
              See standings
            </Link>{" "}
            ·{" "}
            <Link href="/quests" className="underline">
              Back to your quests
            </Link>
          </>
        }
      />

      <SubmitSpotForm />

      <section className="mt-8 flex flex-col gap-4">
        <h2 className="voice">open bounties near you</h2>
        {bounties.length === 0 ? (
          <p className="rounded-xl border border-line p-6 text-center text-sm text-ink-dim">
            No open bounties right now. Submit a spot above, or check back as the
            community grows.
          </p>
        ) : (
          bounties.map((b) => (
            <article
              key={b.id}
              className="flex flex-col gap-2 rounded-xl border border-line p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-ink">
                    {b.place?.name ?? "A hidden spot"}
                  </p>
                  <p className="text-xs text-ink-dim">
                    {b.type === "verify" ? "Verify it exists" : "Go discover it"}
                    {b.area ? ` · ${b.area}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-raise px-2 py-0.5 font-mono text-xs text-ink-dim">
                  +{b.bounty_points} pts
                </span>
              </div>
              <ConfirmFlow bountyId={b.id} />
            </article>
          ))
        )}
      </section>
    </Screen>
  );
}
