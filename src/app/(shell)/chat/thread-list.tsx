"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn, formatRelativeTime } from "@/lib/utils";

export type ThreadSummary = {
  id: string;
  title: string | null;
  city: string;
  updated_at: string;
};

/**
 * Past conversations, newest first. Rendered twice: inside the persistent
 * desktop sidebar and inside the phone history sheet - so it owns rows only,
 * no chrome. Delete is two-tap: first tap arms, second confirms.
 */
export function ThreadList({
  threads,
  activeId,
  loadingId,
  loaded,
  listError,
  hasMore,
  loadingMore,
  onSelect,
  onDelete,
  onNewAsk,
  onLoadMore,
  onRetry,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
  loadingId: string | null;
  loaded: boolean;
  listError: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewAsk: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-[calc(var(--safe-top)+1rem)]">
        <p className="voice mb-3">past asks</p>
        <button
          type="button"
          onClick={onNewAsk}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-accent/50 px-4 py-2 text-sm text-accent transition-colors hover:bg-accent/10"
        >
          <Plus className="size-4" /> New ask
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {!loaded ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : listError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <p className="text-sm text-ink-dim">
              Couldn&rsquo;t load your history.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full border border-accent/50 px-4 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
            >
              Try again
            </button>
          </div>
        ) : threads.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-dim">
            Nothing asked yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {threads.map((t) => {
              const active = t.id === activeId;
              const armed = armedDelete === t.id;
              return (
                <li key={t.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    disabled={loadingId === t.id}
                    className={cn(
                      "w-full rounded-xl border-l-2 px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-accent bg-accent/10"
                        : "border-transparent hover:bg-raise/60",
                    )}
                  >
                    <span
                      className={cn(
                        "block truncate pr-7 text-sm",
                        active ? "text-ink" : "text-ink-dim",
                      )}
                    >
                      {t.title?.trim() || "Untitled ask"}
                    </span>
                    <span className="mt-0.5 block font-mono text-[0.65rem] text-ink-dim/70">
                      {loadingId === t.id
                        ? "opening…"
                        : formatRelativeTime(t.updated_at)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={
                      armed ? "Confirm delete" : `Delete "${t.title ?? "ask"}"`
                    }
                    onClick={() => {
                      if (armed) {
                        setArmedDelete(null);
                        onDelete(t.id);
                      } else {
                        setArmedDelete(t.id);
                      }
                    }}
                    onBlur={() => setArmedDelete(null)}
                    className={cn(
                      "absolute right-2 top-2.5 rounded-full p-1.5 transition-all",
                      armed
                        ? "bg-danger/20 text-danger"
                        : "text-ink-dim/0 hover:!text-danger group-hover:text-ink-dim focus-visible:text-ink-dim",
                    )}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {loaded && !listError && hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="mt-2 w-full rounded-full border border-line px-4 py-1.5 text-xs text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load older"}
          </button>
        )}
      </div>
    </div>
  );
}
