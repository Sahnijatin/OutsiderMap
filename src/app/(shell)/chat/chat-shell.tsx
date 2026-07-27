"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Screen } from "@/components/app/screen";
import { ChatThread, type Message } from "./thread";
import { ThreadList, type ThreadSummary } from "./thread-list";

const PAGE_SIZE = 20;

/**
 * Chat 2.0 shell: a fresh conversation by default, with history one tap
 * away - a persistent sidebar on lg+, a slide-over sheet on phones. Owns
 * the thread list and which conversation is open; the pane itself remounts
 * per conversation via chatKey.
 */
export function ChatShell({ displayName }: { displayName: string | null }) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<Message[] | undefined>();
  const [chatKey, setChatKey] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const reduced = useReducedMotion() ?? false;

  // Load the thread list (list only - the conversation pane starts fresh).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/threads");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { threads: ThreadSummary[] };
        if (cancelled) return;
        setThreads(body.threads);
        setHasMore(body.threads.length >= PAGE_SIZE);
        setListError(false);
      } catch {
        if (!cancelled) setListError(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  // Escape closes the phone history sheet.
  useEffect(() => {
    if (!historyOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHistoryOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  const openThread = useCallback(async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/chat/threads/${id}`);
      if (!res.ok) throw new Error();
      const body = (await res.json()) as {
        messages: Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
          picks: Message["picks"];
          plan_id?: string | null;
          market_run_id?: string | null;
          degraded?: boolean;
        }>;
      };
      setActiveId(id);
      setInitialMessages(
        body.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          picks: m.picks,
          planId: m.plan_id,
          marketRunId: m.market_run_id,
          degraded: m.degraded,
        })),
      );
      setChatKey((k) => k + 1);
      setHistoryOpen(false);
    } catch {
      // Say so in the pane rather than silently doing nothing - an
      // unexplained empty pane reads as "my conversation was never saved".
      setActiveId(id);
      setInitialMessages([
        {
          id: "load-error",
          role: "assistant",
          content:
            "Couldn't load this conversation just now - give it another tap.",
          tone: "error",
        },
      ]);
      setChatKey((k) => k + 1);
      setHistoryOpen(false);
    } finally {
      setLoadingId(null);
    }
  }, []);

  const newAsk = useCallback(() => {
    setActiveId(null);
    setInitialMessages(undefined);
    setChatKey((k) => k + 1);
    setHistoryOpen(false);
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      // Optimistic: the row disappears now, the server catches up.
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (activeId === id) newAsk();
      void fetch(`/api/chat/threads/${id}`, { method: "DELETE" }).catch(
        () => {},
      );
    },
    [activeId, newAsk],
  );

  const loadMore = useCallback(async () => {
    const oldest = threads[threads.length - 1];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/chat/threads?before=${encodeURIComponent(oldest.updated_at)}`,
      );
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { threads: ThreadSummary[] };
      setThreads((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...body.threads.filter((t) => !seen.has(t.id))];
      });
      setHasMore(body.threads.length >= PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [threads, loadingMore]);

  const onThreadCreated = useCallback((id: string, firstMessage: string) => {
    setActiveId(id);
    setThreads((prev) => [
      {
        id,
        title: firstMessage.slice(0, 80),
        city: "",
        updated_at: new Date().toISOString(),
      },
      ...prev.filter((t) => t.id !== id),
    ]);
  }, []);

  const onActivity = useCallback((id: string) => {
    setThreads((prev) => {
      const hit = prev.find((t) => t.id === id);
      if (!hit) return prev;
      return [
        { ...hit, updated_at: new Date().toISOString() },
        ...prev.filter((t) => t.id !== id),
      ];
    });
  }, []);

  const list = (
    <ThreadList
      threads={threads}
      activeId={activeId}
      loadingId={loadingId}
      loaded={loaded}
      listError={listError}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onSelect={(id) => void openThread(id)}
      onDelete={deleteThread}
      onNewAsk={newAsk}
      onLoadMore={() => void loadMore()}
      onRetry={() => {
        setLoaded(false);
        setRetryToken((t) => t + 1);
      }}
    />
  );

  return (
    // Full-bleed: chat is a fixed-height split pane that owns its own
    // geometry (composer pinned to the keyboard, history sidebar).
    <Screen
      inset={false}
      // overflow-hidden makes this pane the hard viewport edge: without it a
      // long conversation grows the flex/grid children (min-height:auto) past
      // h-dvh and the PAGE becomes the scroller - the history sidebar rides
      // along and the messages pane's own scrollbar never engages.
      className="h-dvh overflow-hidden pb-[var(--tab-clearance)] lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]"
    >
      {/* Desktop: persistent history sidebar - static; only messages scroll. */}
      <aside className="hidden h-full min-h-0 flex-col overflow-hidden border-r border-line bg-surface/30 lg:flex">
        {list}
      </aside>

      <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden lg:max-w-2xl">
        <ChatThread
          key={chatKey}
          displayName={displayName}
          threadId={activeId ?? undefined}
          initialMessages={initialMessages}
          onThreadCreated={onThreadCreated}
          onActivity={onActivity}
          onNewAsk={newAsk}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      </div>

      {/* Phone: history slide-over sheet. */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.2 }}
              onClick={() => setHistoryOpen(false)}
              className="fixed inset-0 z-40 bg-night/70 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Chat history"
              initial={{ x: reduced ? 0 : "100%" }}
              animate={{ x: 0 }}
              exit={{ x: reduced ? 0 : "100%" }}
              transition={{ duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm border-l border-line bg-night lg:hidden"
            >
              {list}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Screen>
  );
}
