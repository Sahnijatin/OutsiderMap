"use client";

import Link from "next/link";
import { Bell, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/app/empty-state";
import { Screen } from "@/components/app/screen";
import { FEED_TABS, type FeedTab, type PostCard as PostCardData } from "@/lib/feed/read";
import { PostCard } from "./post-card";

const TAB_LABEL: Record<FeedTab, string> = { home: "Home", discover: "Discover" };

type FeedResponse = { posts: PostCardData[]; nextCursor: string | null };

export function FeedClient() {
  const [tab, setTab] = useState<FeedTab>("home");
  const [posts, setPosts] = useState<PostCardData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadedTab, setLoadedTab] = useState<FeedTab | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Monotonic token: a newer request supersedes an in-flight one, so a late
  // response from the tab you just left is dropped.
  const reqId = useRef(0);

  // The first page for a tab hasn't landed yet -> show the spinner. Derived,
  // so switching tabs never needs a synchronous setState in the effect.
  const initialLoading = loadedTab !== tab;

  // Load the first page whenever the tab changes. Every setState runs after
  // the await, so nothing updates synchronously inside the effect body.
  useEffect(() => {
    const myReq = ++reqId.current;
    (async () => {
      try {
        const res = await fetch(`/api/feed?tab=${tab}`);
        if (!res.ok) throw new Error();
        const body = (await res.json()) as FeedResponse;
        if (myReq !== reqId.current) return;
        setPosts(body.posts);
        setCursor(body.nextCursor);
        setError(null);
        setLoadedTab(tab);
      } catch {
        if (myReq === reqId.current) {
          setError("Couldn't load the feed. Try again.");
          setLoadedTab(tab);
        }
      }
    })();
  }, [tab, reloadKey]);

  function retry() {
    setLoadedTab(null); // show the spinner again
    setReloadKey((k) => k + 1);
  }

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const myReq = reqId.current;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/feed?tab=${tab}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!res.ok) throw new Error();
      const body = (await res.json()) as FeedResponse;
      if (myReq !== reqId.current) return; // tab changed mid-flight
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...body.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(body.nextCursor);
    } catch {
      setError("Couldn't load more.");
    } finally {
      if (myReq === reqId.current) setLoadingMore(false);
    }
  }, [cursor, loadingMore, tab]);

  return (
    <Screen width="narrow">
      <h1 className="sr-only">Feed</h1>
      {/* The bar starts below the notch (the negative margin cancels the
          screen's safe-top padding), then re-pads itself so the blurred
          background covers the notch once it sticks. */}
      <div
        role="tablist"
        aria-label="Feed"
        className="sticky top-0 z-10 -mx-5 mb-4 -mt-[var(--safe-top)] flex items-center gap-1 border-b border-line bg-night/85 px-5 pb-2 pt-[calc(var(--safe-top)+0.5rem)] backdrop-blur-md"
      >
        {FEED_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-accent/10 text-accent" : "text-ink-dim hover:text-ink",
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
        <Link
          href="/activity"
          aria-label="Activity"
          className="ml-auto flex size-9 items-center justify-center rounded-full text-ink-dim hover:text-ink"
        >
          <Bell className="size-5" />
        </Link>
      </div>

      {initialLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : error && posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={retry} className="text-sm text-accent hover:underline">
            Try again
          </button>
        </div>
      ) : posts.length === 0 ? (
        tab === "home" ? (
          <EmptyState
            className="mt-8"
            title="Your feed is quiet"
            body="Follow a few outsiders and their posts land here. Discover is where you find them."
            action={
              <Button variant="secondary" onClick={() => setTab("discover")}>
                Browse Discover
              </Button>
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
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {cursor ? (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mx-auto mt-2 inline-flex items-center gap-2 rounded-full border border-line px-5 py-2 text-sm text-ink-dim hover:text-ink disabled:opacity-50"
            >
              {loadingMore && <Spinner />}
              {loadingMore ? "Loading…" : "Load more"}
            </button>
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
  );
}
