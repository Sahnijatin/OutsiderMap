"use client";

import Link from "next/link";
import { ArrowUp, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { publicMediaUrl } from "@/lib/media/url";
import { cn } from "@/lib/utils";
import type { ChatPickCard } from "@/lib/chat/engine";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  picks?: ChatPickCard[] | null;
};

const SUGGESTIONS = [
  "I want something good and crispy",
  "quiet place to read for a few hours",
  "first date, not trying too hard",
  "it's late and I'm starving",
];

export function ChatThread({ displayName }: { displayName: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Restore the latest thread once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/threads?latest=1");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as {
          threads: { id: string }[];
          messages: {
            id: string;
            role: "user" | "assistant";
            content: string;
            picks: ChatPickCard[] | null;
          }[];
        };
        if (cancelled) return;
        if (body.threads.length > 0 && body.messages.length > 0) {
          setThreadId(body.threads[0].id);
          setMessages(
            body.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              picks: m.picks,
            })),
          );
        }
      } catch {
        // A fresh thread is a fine fallback.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${prev.length}`, role: "user", content: message },
    ]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message }),
      });
      const body = (await res.json()) as {
        threadId?: string;
        text?: string;
        picks?: ChatPickCard[];
        message?: string;
      };
      if (!res.ok) throw new Error(body.message ?? "chat failed");
      if (body.threadId) setThreadId(body.threadId);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${prev.length}`,
          role: "assistant",
          content: body.text ?? "",
          picks: body.picks,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${prev.length}`,
          role: "assistant",
          content:
            err instanceof Error && err.message !== "chat failed"
              ? err.message
              : "Lost my train of thought - say that again?",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function newThread() {
    setThreadId(undefined);
    setMessages([]);
  }

  const firstName = (displayName ?? "").trim().split(/\s+/)[0] || null;
  const empty = messages.length === 0;

  return (
    <>
      <header className="flex items-center justify-between px-5 pb-2 pt-4">
        <p className="voice">the concierge</p>
        {!empty && (
          <button
            type="button"
            onClick={newThread}
            className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-ink-dim transition-colors hover:text-ink"
          >
            <Plus className="size-3.5" /> New ask
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5">
        {restoring ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-5" />
          </div>
        ) : empty ? (
          <div className="flex h-full flex-col justify-center gap-6">
            <div className="relative">
              <div className="halo absolute -inset-10" />
              <h1 className="relative font-display text-3xl italic">
                {firstName ? `${firstName}.` : "Hey."} What are you in the
                mood for?
              </h1>
              <p className="relative mt-2 text-sm text-ink-dim">
                Say it however it comes out. Vague is fine - that&rsquo;s
                what the questions are for.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-left text-sm text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col gap-2",
                  m.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-card px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-raise text-ink"
                      : "border border-line/70 bg-surface text-ink",
                  )}
                >
                  {m.content}
                </div>
                {m.picks && m.picks.length > 0 && (
                  <div className="flex w-full flex-col gap-2">
                    {m.picks.map((pick) => (
                      <PickCard key={pick.slug} pick={pick} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-ink-dim">
                <span className="flex gap-1">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </span>
                thinking about it
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        className="border-t border-line/60 bg-night/90 px-4 py-3 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me what you're craving…"
            enterKeyHint="send"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-ink-dim"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || !input.trim()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-night transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-pulse rounded-full bg-accent"
      style={{ animationDelay: delay }}
    />
  );
}

function PickCard({ pick }: { pick: ChatPickCard }) {
  const img = publicMediaUrl("place-images", pick.image_path);

  function logClick() {
    // Fire-and-forget learning signal; navigation proceeds regardless.
    void fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "chat_pick_click", placeId: pick.id }),
    }).catch(() => {});
  }

  return (
    <Link
      href={`/map?place=${encodeURIComponent(pick.slug)}`}
      onClick={logClick}
      className="flex gap-3 rounded-card border border-line/70 bg-surface p-3 transition-colors hover:border-accent/50"
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt=""
          className="size-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-raise font-display text-lg italic text-accent">
          {pick.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{pick.name}</p>
        {pick.area && <p className="text-xs text-ink-dim">{pick.area}</p>}
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-dim">
          {pick.reason}
        </p>
      </div>
    </Link>
  );
}
