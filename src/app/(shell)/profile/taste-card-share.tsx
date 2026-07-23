"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { setTasteCardPublic } from "./actions";

/**
 * Opt-in control for the shareable taste card (#121): a public/private switch,
 * and — once public — a native-share / clipboard button for the /card/[username]
 * link. Mirrors the personalization-toggle + identity-card share patterns.
 */
export function TasteCardShare({
  username,
  initialPublic,
}: {
  username: string | null;
  initialPublic: boolean;
}) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const cardUrl = username
    ? `https://www.outsidermap.com/card/${username}`
    : null;

  async function toggle() {
    const next = !isPublic;
    setIsPublic(next); // optimistic
    setBusy(true);
    try {
      await setTasteCardPublic(next);
    } catch {
      setIsPublic(!next); // revert
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!cardUrl) return;
    const text = "Here's OutsiderMap's read on my taste.";
    try {
      if (navigator.share) {
        await navigator.share({ text, url: cardUrl });
        return;
      }
      throw new Error("no share sheet");
    } catch {
      try {
        await navigator.clipboard.writeText(`${text} ${cardUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Nothing sane left to do.
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink">Your taste card</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-dim">
            {isPublic
              ? "Public — anyone with the link can see your read."
              : "Private. Make it public to share the “here’s my read” card."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-label="Make taste card public"
          disabled={busy}
          onClick={toggle}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
            isPublic ? "border-accent bg-accent/30" : "border-line bg-raise",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 rounded-full transition-all",
              isPublic ? "left-6 bg-accent" : "left-0.5 bg-ink-dim",
            )}
            style={{ width: 22, height: 22 }}
          />
        </button>
      </div>

      {isPublic && cardUrl && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void share()}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-night transition-transform hover:-translate-y-0.5"
          >
            <Share2 className="size-4" />
            {copied ? "Copied the link" : "Share your card"}
          </button>
          <a
            href={`/card/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-ink-dim underline-offset-2 hover:underline"
          >
            Preview
          </a>
        </div>
      )}
    </div>
  );
}
