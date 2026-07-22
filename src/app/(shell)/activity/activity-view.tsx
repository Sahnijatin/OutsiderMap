"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

type ActivityType = "follow" | "like" | "want_to_go" | "comment" | "quest_complete";

type Actor = {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
} | null;

type Item = {
  id: number;
  type: ActivityType;
  post_id: string | null;
  created_at: string;
  read: boolean;
  actor: Actor;
};

const VERB: Record<ActivityType, string> = {
  follow: "started following you",
  like: "liked your post",
  want_to_go: "wants to go where you posted",
  comment: "commented on your post",
  quest_complete: "completed a quest",
};

function actorName(a: Actor): string {
  if (a?.username) return `@${a.username}`;
  if (a?.display_name) return a.display_name;
  return "An outsider";
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function ActivityView() {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const res = await fetch("/api/activity");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { items: Item[] };
        setItems(body.items);
        setStatus("ready");
        // Mark read after showing (best-effort).
        void fetch("/api/activity", { method: "POST" });
      } catch {
        setStatus("error");
      }
    })();
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-28 pt-4">
      <Link
        href="/feed"
        className="mb-3 inline-flex items-center gap-1 text-sm text-ink-dim hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Feed
      </Link>
      <h1 className="mb-4 font-display text-xl text-ink">Activity</h1>

      {status === "loading" ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6" />
        </div>
      ) : status === "error" ? (
        <p className="py-16 text-center text-sm text-danger">
          Couldn&apos;t load your activity.
        </p>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-dim">
          Nothing yet. Likes, follows and comments show up here.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((it) => {
            const row = (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl px-2 py-3",
                  !it.read && "bg-accent/5",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-raise text-sm text-ink-dim">
                  {it.actor?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.actor.avatar_url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    actorName(it.actor).replace("@", "").charAt(0).toUpperCase()
                  )}
                </span>
                <p className="min-w-0 flex-1 text-sm text-ink">
                  <span className="font-medium">{actorName(it.actor)}</span>{" "}
                  <span className="text-ink-dim">{VERB[it.type]}</span>
                </p>
                <span className="shrink-0 text-xs text-ink-dim">
                  {timeAgo(it.created_at)}
                </span>
              </div>
            );
            return (
              <li key={it.id} className="border-b border-line/40 last:border-0">
                {it.post_id ? (
                  <Link href={`/feed/${it.post_id}`}>{row}</Link>
                ) : it.actor?.username ? (
                  <Link href={`/profile/${it.actor.username}`}>{row}</Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
