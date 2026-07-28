"use client";

import { useState } from "react";
import { playSound } from "@/lib/sound/engine";

type Phase = "idle" | "sending" | "done" | "error";

/**
 * One field that takes either a Google Maps link or a name, an optional
 * comment, one button. Success resets fast so a scouting walk can drop
 * spot after spot without ceremony.
 */
export function SubmitForm() {
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || phase === "sending") return;
    setPhase("sending");
    setMessage(null);
    const isLink = /^https?:\/\/\S+$/i.test(trimmed);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isLink ? { link: trimmed } : { name: trimmed }),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setPhase("error");
        setMessage(body?.message ?? "That one didn't go through - try again?");
        return;
      }
      playSound("send");
      setPhase("done");
      setValue("");
      setComment("");
    } catch {
      setPhase("error");
      setMessage("That one didn't go through - try again?");
    }
  }

  if (phase === "done") {
    return (
      <div className="mt-8 rounded-card border border-line bg-surface p-6">
        <p className="font-display text-xl italic">Got it.</p>
        <p className="mt-2 text-sm text-ink-dim">
          We&rsquo;ll do the digging - it shows up on the map once it&rsquo;s
          verified. Thank you for feeding the map.
        </p>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="mt-4 rounded-full border border-accent/50 px-4 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
        >
          Drop another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste a Google Maps link, or just type the name"
        autoFocus
        className="w-full rounded-card border border-line bg-surface px-4 py-3.5 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent/60"
      />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Anything we should know? The dish, the corner, the story… (optional)"
        className="w-full rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-dim focus:border-accent/60"
      />
      {message && <p className="text-sm text-danger">{message}</p>}
      <div>
        <button
          type="submit"
          disabled={!value.trim() || phase === "sending"}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-night transition-opacity disabled:opacity-40"
        >
          {phase === "sending" ? "Sending…" : "Send it"}
        </button>
      </div>
    </form>
  );
}
