import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listNearbyBounties } from "@/lib/scout/bounties";
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
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-[calc(var(--tab-clearance)+2rem)] pt-[calc(var(--safe-top)+1.5rem)] lg:max-w-3xl lg:px-8 lg:pt-12">
      <header className="mb-6">
        <p className="voice">scout economy</p>
        <h1 className="mt-1 font-display text-3xl italic lg:text-4xl">
          Verify the map. Earn your place on it.
        </h1>
        <p className="mt-2 text-sm text-ink-dim">
          Go to a listed spot, prove it exists with a live photo, and both you
          and the scout who found it earn points.{" "}
          <Link href="/quests" className="underline">
            Back to your quests
          </Link>
        </p>
      </header>

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
    </main>
  );
}
