import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PullToRefresh } from "@/components/app/pull-to-refresh";
import { Screen } from "@/components/app/screen";
import { fetchFeedPage } from "@/lib/feed/query";
import type { FeedTab } from "@/lib/feed/read";
import { FeedTabs } from "./feed-tabs";
import { FeedMore } from "./feed-more";
import { PostCard } from "./post-card";

export const metadata: Metadata = { title: "Feed" };

/**
 * The social feed: Home (your network) and Discover (public), place-anchored.
 * Server-rendered: the first page arrives with the HTML (no client fetch
 * waterfall), the tab lives in the URL so it is linkable and survives refresh,
 * and two small islands handle tab switching and "load more". A failed query
 * throws to the (shell) error boundary, so the nav survives.
 */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await requireOnboarded();
  const { tab: rawTab } = await searchParams;
  const tab: FeedTab = rawTab === "discover" ? "discover" : "home";

  const supabase = await createClient();
  const { posts, nextCursor } = await fetchFeedPage(supabase, profile.id, tab);

  return (
    <PullToRefresh>
    <Screen width="narrow">
      <h1 className="sr-only">Feed</h1>
      <FeedTabs active={tab} />

      {posts.length === 0 ? (
        tab === "home" ? (
          <EmptyState
            className="mt-8"
            title="Your feed is quiet"
            body="Follow a few outsiders and their posts land here. Discover is where you find them."
            action={
              <ButtonLink href="/feed?tab=discover" variant="secondary">
                Browse Discover
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            className="mt-8"
            title="Nothing to discover yet"
            body="Public posts show up here as members share places. Be the first."
            action={<ButtonLink href="/compose">Share a place</ButtonLink>}
          />
        )
      ) : (
        <div className="om-stagger flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {nextCursor ? (
            <FeedMore
              tab={tab}
              initialCursor={nextCursor}
              seedIds={posts.map((p) => p.id)}
            />
          ) : (
            <p className="py-6 text-center text-xs text-ink-dim">
              You&apos;re all caught up.
            </p>
          )}
        </div>
      )}

      <Link
        href="/compose"
        aria-label="Share a place"
        className="fixed bottom-[calc(var(--tab-clearance)+0.75rem)] right-5 z-30 flex size-14 items-center justify-center rounded-full bg-accent text-night shadow-lg transition-colors hover:bg-ember lg:bottom-6"
      >
        <Plus className="size-6" />
      </Link>
    </Screen>
    </PullToRefresh>
  );
}
