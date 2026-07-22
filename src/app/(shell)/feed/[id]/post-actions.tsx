"use client";

import { useState } from "react";
import { Flag, Heart, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactionKind } from "@/lib/feed/model";

/**
 * Like / want_to_go / report on the post detail. Reactions toggle
 * optimistically and roll back on failure; the counters shown are the
 * client's local view (the DB counters are trigger-maintained server-side).
 */
export function PostActions({
  postId,
  initialLiked,
  initialWanted,
  likeCount,
  wantCount,
}: {
  postId: string;
  initialLiked: boolean;
  initialWanted: boolean;
  likeCount: number;
  wantCount: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [wanted, setWanted] = useState(initialWanted);
  const [likes, setLikes] = useState(likeCount);
  const [wants, setWants] = useState(wantCount);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);

  async function toggle(
    kind: ReactionKind,
    on: boolean,
    setOn: (v: boolean) => void,
    setCount: (fn: (c: number) => number) => void,
  ) {
    if (busy) return;
    setBusy(true);
    setOn(!on);
    setCount((c) => c + (on ? -1 : 1));
    try {
      const res = await fetch(`/api/posts/${postId}/reactions`, {
        method: on ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOn(on);
      setCount((c) => c + (on ? 1 : -1));
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    if (reported) return;
    setReported(true);
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: "post", target_id: postId }),
      });
    } catch {
      // Best-effort; the reported UI state stays so it can't be spammed.
    }
  }

  return (
    <div className="flex items-center gap-2 px-1 py-3">
      <button
        onClick={() => toggle("like", liked, setLiked, setLikes)}
        aria-pressed={liked}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
          liked
            ? "border-danger/50 bg-danger/10 text-danger"
            : "border-line text-ink-dim hover:text-ink",
        )}
      >
        <Heart className={cn("size-4", liked && "fill-current")} /> {likes}
      </button>
      <button
        onClick={() => toggle("want_to_go", wanted, setWanted, setWants)}
        aria-pressed={wanted}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
          wanted
            ? "border-accent/50 bg-accent/10 text-accent"
            : "border-line text-ink-dim hover:text-ink",
        )}
      >
        <Star className={cn("size-4", wanted && "fill-current")} /> Want to go ·{" "}
        {wants}
      </button>
      <button
        onClick={report}
        disabled={reported}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-dim hover:text-ink disabled:opacity-60"
      >
        <Flag className="size-4" /> {reported ? "Reported" : "Report"}
      </button>
    </div>
  );
}
