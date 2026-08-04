"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import type { FeedTab, PostCard as PostCardData } from "@/lib/feed/read";
import { FeedCard } from "./article-card";

type FeedResponse = { posts: PostCardData[]; nextCursor: string | null };

/**
 * Keyset pagination island. The server page renders the first page; this
 * appends later pages via the existing /api/feed route. `seedIds` are the
 * server-rendered post ids, so a microsecond cursor tie can't double-show a
 * card across the server/client boundary.
 */
export function FeedMore({
  tab,
  initialCursor,
  seedIds,
}: {
  tab: FeedTab;
  initialCursor: string;
  seedIds: string[];
}) {
  const [posts, setPosts] = useState<PostCardData[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/feed?tab=${tab}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!res.ok) throw new Error();
      const body = (await res.json()) as FeedResponse;
      setPosts((prev) => {
        const seen = new Set([...seedIds, ...prev.map((p) => p.id)]);
        return [...prev, ...body.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(body.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {posts.map((post) => (
        <FeedCard key={post.id} post={post} />
      ))}
      {error && (
        <p className="text-center text-sm text-danger">Couldn&apos;t load more.</p>
      )}
      {cursor ? (
        <button
          onClick={loadMore}
          disabled={loading}
          className="mx-auto mt-2 inline-flex items-center gap-2 rounded-full border border-line px-5 py-2 text-sm text-ink-dim hover:text-ink disabled:opacity-50"
        >
          {loading && <Spinner />}
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : (
        <p className="py-6 text-center text-xs text-ink-dim">
          You&apos;re all caught up.
        </p>
      )}
    </>
  );
}
