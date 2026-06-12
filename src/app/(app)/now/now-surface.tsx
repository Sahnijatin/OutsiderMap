"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn, priceGlyph } from "@/lib/utils";
import type { Recommendation } from "@/lib/now/recommend";
import { askNow, dismissPlace, markVisited, savePlace, unsavePlace } from "./actions";

const SUGGESTIONS = [
  "quiet chai, no talking",
  "cheap kebabs, open now",
  "date spot that isn't trying too hard",
  "i need to dance",
  "heartbroken, want grease",
];

const WAIT_LINES = [
  "Reading the city…",
  "Checking what's still open…",
  "Cross-referencing your 2am history…",
  "Arguing with ourselves about the top pick…",
];

function WaitState() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % WAIT_LINES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <Spinner className="size-6" />
      <p aria-live="polite" className="font-mono text-sm text-ink-dim">
        {WAIT_LINES[line]}
      </p>
    </div>
  );
}

function StreamedWhy({ slug, query }: { slug: string; query: string }) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);

  // Remounted via key when slug/query change, so no state reset needed here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/now/why", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, query }),
        });
        if (!res.ok || !res.body) throw new Error(String(res.status));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          const chunk = decoder.decode(value, { stream: true });
          setText((t) => t + chunk);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, query]);

  if (failed) return null;
  return (
    <p className="font-display text-lg leading-relaxed text-ink">
      {text}
      {text.length === 0 && (
        <span aria-hidden className="animate-pulse text-accent">▍</span>
      )}
    </p>
  );
}

function PickCard({
  pick,
  query,
  top,
  onDismiss,
}: {
  pick: Recommendation;
  query: string;
  top: boolean;
  onDismiss: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [visited, setVisited] = useState(false);
  const place = pick.place;

  async function toggleSave() {
    setSaved((s) => !s);
    try {
      if (saved) await unsavePlace(place.id);
      else await savePlace(place.id);
    } catch {
      setSaved((s) => !s);
    }
  }

  function dismiss() {
    onDismiss();
    dismissPlace(place.id, query).catch(() => {});
  }

  function been() {
    setVisited(true);
    markVisited(place.id).catch(() => {});
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "rounded-card border bg-surface",
        top ? "border-accent/40 p-7" : "border-line p-5",
      )}
    >
      {top && <p className="voice mb-4">The answer</p>}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className={cn("font-display", top ? "text-3xl" : "text-xl")}>
          {place.name}
        </h2>
        <span className="text-sm text-ink-dim">
          {[place.area, place.category, priceGlyph(place.price_level)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {place.openLabel && (
          <Badge
            variant={place.openLabel.startsWith("open") ? "accent" : "outline"}
          >
            {place.openLabel}
          </Badge>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {top ? (
          <StreamedWhy key={`${place.slug}:${query}`} slug={place.slug} query={query} />
        ) : (
          pick.reason && (
            <p className="text-sm leading-relaxed text-ink-dim">{pick.reason}</p>
          )
        )}
        {top && place.editor_note && (
          <p className="text-sm text-ink-dim">
            <span className="font-mono text-xs uppercase tracking-widest text-accent">
              editor&rsquo;s note ·{" "}
            </span>
            {place.editor_note}
          </p>
        )}
      </div>

      {top && place.vibe_tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {place.vibe_tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={saved ? "primary" : "secondary"}
          onClick={toggleSave}
        >
          {saved ? "Saved" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={been} disabled={visited}>
          {visited ? "Noted" : "Been here"}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not tonight
        </Button>
      </div>
    </motion.article>
  );
}

export function NowSurface() {
  const [query, setQuery] = useState("");
  const [askedQuery, setAskedQuery] = useState("");
  const [picks, setPicks] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function ask(text: string) {
    const q = text.trim();
    if (q.length < 2 || pending) return;
    setError(null);
    setPicks(null);
    setAskedQuery(q);
    startTransition(async () => {
      try {
        const result = await askNow(q);
        setPicks(result.picks);
      } catch {
        setError(
          "Couldn’t read the city just now. Give it a second and ask again.",
        );
      }
    });
  }

  function dismissAt(slug: string) {
    setPicks((p) => p?.filter((pick) => pick.place.slug !== slug) ?? null);
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(query);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="ask" className="sr-only">
          What do you want right now?
        </label>
        <div className="flex items-center gap-2 rounded-card border border-line bg-surface px-5 py-2 focus-within:border-accent">
          <span aria-hidden className="font-mono text-accent">&gt;</span>
          <input
            id="ask"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="say it like you'd text a friend…"
            maxLength={500}
            className="h-11 w-full bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-dim/50"
          />
          <Button type="submit" size="sm" disabled={pending || query.trim().length < 2}>
            Ask
          </Button>
        </div>
      </form>

      {!picks && !pending && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                ask(s);
              }}
              className="rounded-full border border-line px-3.5 py-1.5 text-sm text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {pending && <WaitState />}

      {error && <p className="text-sm text-danger">{error}</p>}

      {picks && picks.length === 0 && (
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <p className="font-display text-xl">Nothing matched that.</p>
          <p className="mt-2 text-sm text-ink-dim">
            Loosen it up — drop the area or the budget and ask again.
          </p>
        </div>
      )}

      {picks && picks.length > 0 && (
        <div className="flex flex-col gap-4">
          <AnimatePresence mode="popLayout">
            {picks.map((pick, i) => (
              <PickCard
                key={pick.place.slug}
                pick={pick}
                query={askedQuery}
                top={i === 0}
                onDismiss={() => dismissAt(pick.place.slug)}
              />
            ))}
          </AnimatePresence>
          {picks.length > 1 && (
            <p className="text-center font-mono text-xs text-ink-dim/60">
              two backups, in case — but trust the first one
            </p>
          )}
        </div>
      )}
    </div>
  );
}
