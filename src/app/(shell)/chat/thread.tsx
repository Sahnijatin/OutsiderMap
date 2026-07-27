"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUp, History, Mic, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSpeechInput } from "@/lib/voice/use-speech-input";
import { tap as hapticTap } from "@/lib/native/haptics";
import { playSound } from "@/lib/sound/engine";
import { publicMediaUrl } from "@/lib/media/url";
import { cn } from "@/lib/utils";
import type { ChatPickCard } from "@/lib/chat/engine";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  picks?: ChatPickCard[] | null;
  /** Set when the turn built a trackable market shopping run - links to it. */
  marketRunId?: string | null;
  /** True when the concierge was down and this answer is a plain keyword fallback. */
  degraded?: boolean;
  /** UI-only decorations for failure/backoff bubbles. */
  tone?: "error" | "limit";
};

const SUGGESTIONS = [
  "I want something good and crispy",
  "quiet place to read for a few hours",
  "first date, not trying too hard",
  "it's late and I'm starving",
];

/**
 * One conversation pane. Fresh chats start empty by design - history lives
 * in the thread list (sidebar on desktop, sheet on phones) and an opened
 * thread arrives via initialMessages/threadId. The parent remounts this
 * component (key change) when switching conversations.
 */
export function ChatThread({
  displayName,
  threadId: initialThreadId,
  initialMessages,
  onThreadCreated,
  onActivity,
  onNewAsk,
  onOpenHistory,
}: {
  displayName: string | null;
  threadId?: string;
  initialMessages?: Message[];
  /** A first send created a server thread - lets the list insert it. */
  onThreadCreated?: (id: string, firstMessage: string) => void;
  /** A send landed on an existing thread - lets the list bump it up. */
  onActivity?: (id: string) => void;
  onNewAsk?: () => void;
  /** Present on phones only - opens the history sheet. */
  onOpenHistory?: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId);
  const [city, setCity] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [failedText, setFailedText] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const streamSeq = useRef(0);
  const voice = useSpeechInput();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string, isRetry = false) {
    const message = text.trim();
    if (!message || busy) return;
    // The ask leaving your hands - a gentle upward two-note, and a tick you
    // can feel in the native app. Both no-op when switched off, never throw.
    playSound("send");
    hapticTap();
    setInput("");
    setBusy(true);
    setFailedText(null);
    setMessages((prev) => {
      // A retry replaces the previous failure bubble instead of stacking.
      const base = isRetry
        ? prev.filter((m) => m.tone !== "error")
        : [
            ...prev,
            { id: `local-${prev.length}`, role: "user" as const, content: message },
          ];
      return base;
    });

    // One streaming assistant bubble, grown token-by-token as the SSE arrives.
    const streamId = `stream-${streamSeq.current++}`;
    let acc = "";
    let opened = false;
    const openBubble = () => {
      if (opened) return;
      opened = true;
      setMessages((prev) => [
        ...prev,
        { id: streamId, role: "assistant", content: "" },
      ]);
    };
    const patchBubble = (patch: Partial<Message>) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === streamId ? { ...m, ...patch } : m)),
      );
    const appendAssistant = (m: Omit<Message, "id">) =>
      setMessages((prev) => [...prev, { id: `local-${prev.length}`, ...m }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ threadId, message }),
      });

      if (res.status === 429) {
        const json = (await res.json().catch(() => null)) as ChatResponse | null;
        appendAssistant({
          role: "assistant",
          content:
            (typeof json?.message === "string" && json.message) ||
            "Easy - give it a minute and ask again.",
          tone: "limit",
        });
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("text/event-stream") || !res.body) {
        // Auth/validation/other non-stream responses carry JSON; surface the
        // server's own friendly line (#38) when there is one.
        const json = (await res.json().catch(() => null)) as ChatResponse | null;
        setFailedText(message);
        appendAssistant({
          role: "assistant",
          content:
            (typeof json?.message === "string" && json.message) ||
            "Lost my train of thought - that one didn't go through.",
          tone: "error",
        });
        playSound("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const { event, data } = parseSseFrame(buffer.slice(0, sep));
          buffer = buffer.slice(sep + 2);
          if (event === "delta") {
            openBubble();
            acc += (data as { text?: string })?.text ?? "";
            patchBubble({ content: acc });
          } else if (event === "reset") {
            // A tool-calling turn's interim narration - discard it; the next
            // turn's text streams into the same bubble.
            acc = "";
            openBubble();
            patchBubble({ content: "" });
          } else if (event === "done") {
            const body = data as ChatResponse;
            if (body.threadId) {
              if (!threadId) onThreadCreated?.(body.threadId, message);
              else onActivity?.(threadId);
              setThreadId(body.threadId);
            }
            if (body.city) setCity(body.city);
            openBubble();
            patchBubble({
              content: body.text ?? acc,
              picks: body.picks,
              marketRunId: body.marketRunId,
              degraded: body.degraded,
            });
            playSound("tap"); // The answer arrived - a soft warm tick.
            finished = true;
          } else if (event === "error") {
            setFailedText(message);
            openBubble();
            patchBubble({
              content:
                (data as { message?: string })?.message ??
                "Lost my train of thought - say that again?",
              tone: "error",
            });
            playSound("error"); // A low muted thud, nothing alarming.
            finished = true;
          }
        }
      }
    } catch {
      setFailedText(message);
      const fallback = "Lost my train of thought - that one didn't go through.";
      if (opened) patchBubble({ content: fallback, tone: "error" });
      else appendAssistant({ role: "assistant", content: fallback, tone: "error" });
      playSound("error");
    } finally {
      setBusy(false);
    }
  }

  const firstName = (displayName ?? "").trim().split(/\s+/)[0] || null;
  const empty = messages.length === 0;

  return (
    <>
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(var(--safe-top)+1rem)]">
        <p className="voice">the concierge</p>
        <div className="flex items-center gap-2">
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-ink-dim transition-colors hover:text-ink lg:hidden"
            >
              <History className="size-3.5" /> History
            </button>
          )}
          {!empty && onNewAsk && (
            <button
              type="button"
              onClick={onNewAsk}
              className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-ink-dim transition-colors hover:text-ink"
            >
              <Plus className="size-3.5" /> New ask
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5">
        {empty ? (
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
            {messages.map((m, i) => (
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
                      : m.tone === "error"
                        ? "border border-danger/40 bg-danger/5 text-ink-dim"
                        : m.tone === "limit"
                          ? "border border-line/40 bg-transparent text-ink-dim italic"
                          : "border border-line bg-surface text-ink",
                  )}
                >
                  {m.content}
                </div>
                {m.degraded && m.role === "assistant" && (
                  <p className="text-xs italic text-ink-dim">
                    Quick picks while the concierge is out - not personalized.
                  </p>
                )}
                {m.tone === "error" && failedText && !busy && (
                  <button
                    type="button"
                    onClick={() => void send(failedText, true)}
                    className="rounded-full border border-accent/50 px-4 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
                  >
                    Try again
                  </button>
                )}
                {m.picks && m.picks.length > 0 && (
                  <div className="flex w-full flex-col gap-2">
                    {m.picks.map((pick) => (
                      <PickCard key={pick.slug} pick={pick} />
                    ))}
                    <Link
                      href={questHandoffHref(
                        city,
                        lastUserMessageBefore(messages, i),
                      )}
                      className="self-start rounded-full border border-line px-4 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      Turn this into a day →
                    </Link>
                  </div>
                )}
                {m.marketRunId && (
                  <Link
                    href={`/market-run/${m.marketRunId}`}
                    className="self-start rounded-full border border-accent/50 px-4 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
                  >
                    View shopping run →
                  </Link>
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
        className="border-t border-line bg-night/90 px-4 py-3 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-4">
          {voice.supported && (
            <button
              type="button"
              aria-label={voice.listening ? "Stop dictation" : "Speak your ask"}
              aria-pressed={voice.listening}
              onClick={() =>
                voice.listening ? voice.stop() : voice.start(setInput)
              }
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                voice.listening
                  ? "bg-accent/15 text-accent"
                  : "text-ink-dim hover:text-ink",
              )}
            >
              <Mic
                className={cn("size-4", voice.listening && "animate-pulse")}
              />
            </button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              voice.listening ? "Listening…" : "Tell me what you're craving…"
            }
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

type ChatResponse = {
  threadId?: string;
  city?: string;
  text?: string;
  picks?: ChatPickCard[];
  marketRunId?: string;
  degraded?: boolean;
  message?: string;
  error?: string;
  code?: string;
};

/** Parse one SSE frame (`event: X\ndata: {...}`) into its event name + payload. */
function parseSseFrame(frame: string): { event: string | null; data: unknown } {
  let event: string | null = null;
  let dataStr = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  let data: unknown = null;
  if (dataStr) {
    try {
      data = JSON.parse(dataStr);
    } catch {
      data = null;
    }
  }
  return { event, data };
}

/** The user ask that produced the picks at index i - fuels the quest brief. */
function lastUserMessageBefore(messages: Message[], i: number) {
  for (let j = i - 1; j >= 0; j--) {
    if (messages[j].role === "user") return messages[j].content;
  }
  return "";
}

function questHandoffHref(city: string | null, brief: string) {
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (brief) params.set("brief", brief.slice(0, 400));
  const qs = params.toString();
  return qs ? `/quests/new?${qs}` : "/quests/new";
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
    // Fire-and-forget learning signal; navigation proceeds regardless. The
    // answerId ties this click to the exact answer served (#120 accept-rate).
    void fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "chat_pick_click",
        placeId: pick.id,
        answerId: pick.answerId,
      }),
    }).catch(() => {});
  }

  return (
    <Link
      href={`/map?place=${encodeURIComponent(pick.slug)}`}
      onClick={logClick}
      className="flex gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-accent/50"
    >
      {img ? (
        <Image
          src={img}
          alt=""
          width={64}
          height={64}
          sizes="64px"
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
        {pick.reason && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-dim">
            {/* Only a reason the model wrote for this user reads as "why for
                you"; an editor-note fallback is honestly labeled as the
                house note (also covers picks saved before reasonSource). */}
            {pick.reasonSource === "model" ? (
              pick.reason
            ) : (
              <>
                <span className="text-ink-dim/80">From our notes: </span>
                {pick.reason}
              </>
            )}
          </p>
        )}
      </div>
    </Link>
  );
}
