"use client";

import { Ban, Flag, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Per-person safety controls (#122): report a user (→ priority moderation
 * review) and block them (mutual invisibility, bidirectional). Sits next to the
 * follow/friend actions on someone else's profile.
 */
export function SafetyMenu({
  targetId,
  username,
}: {
  targetId: string;
  username: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "report" | "block">("menu");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const who = username ? `@${username}` : "this outsider";

  function reset() {
    setOpen(false);
    setMode("menu");
    setReason("");
  }

  async function submitReport() {
    setBusy(true);
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: "profile",
          target_id: targetId,
          reason: reason.trim() || undefined,
        }),
      });
      setNotice("Reported. Our team will review this.");
    } catch {
      setNotice("Couldn't send the report - try again.");
    } finally {
      setBusy(false);
      reset();
    }
  }

  async function doBlock() {
    setBusy(true);
    try {
      const res = await fetch(`/api/blocks/${targetId}`, { method: "POST" });
      if (res.ok) {
        setBlocked(true);
        setNotice(`You blocked ${who}. You won't see each other.`);
      } else {
        setNotice("Couldn't block - try again.");
      }
    } catch {
      setNotice("Couldn't block - try again.");
    } finally {
      setBusy(false);
      reset();
    }
  }

  async function unblock() {
    setBusy(true);
    try {
      const res = await fetch(`/api/blocks/${targetId}`, { method: "DELETE" });
      if (res.ok) {
        setBlocked(false);
        setNotice(`Unblocked ${who}.`);
      }
    } catch {
      // retryable
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-dim">Blocked</span>
        <Button variant="ghost" size="sm" onClick={unblock} disabled={busy}>
          {busy ? <Spinner className="size-4" /> : null}
          Unblock
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Safety options"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-9 items-center justify-center rounded-full border border-line text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
      >
        <MoreHorizontal className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-xl">
          {mode === "menu" && (
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => setMode("report")}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-dim transition-colors hover:bg-raise hover:text-ink"
              >
                <Flag className="size-4" /> Report {who}
              </button>
              <button
                type="button"
                onClick={() => setMode("block")}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
              >
                <Ban className="size-4" /> Block {who}
              </button>
            </div>
          )}

          {mode === "report" && (
            <div className="flex flex-col gap-2 p-1">
              <p className="text-xs text-ink-dim">
                What&rsquo;s going on? (optional)
              </p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Harassment, impersonation, made me feel unsafe…"
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submitReport} disabled={busy}>
                  {busy ? <Spinner className="size-4" /> : null}
                  Send report
                </Button>
              </div>
            </div>
          )}

          {mode === "block" && (
            <div className="flex flex-col gap-2 p-1">
              <p className="text-sm text-ink">Block {who}?</p>
              <p className="text-xs text-ink-dim">
                You won&rsquo;t see each other anywhere - feed, profile, search.
                They aren&rsquo;t told.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={doBlock} disabled={busy}>
                  {busy ? <Spinner className="size-4" /> : null}
                  Block
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {notice && !open && (
        <p className="absolute right-0 top-11 w-56 text-right text-xs text-ink-dim">
          {notice}
        </p>
      )}
    </div>
  );
}
