"use client";

import Link from "next/link";
import { MapPin, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { publicMediaUrl } from "@/lib/media/url";

type FeedReel = {
  id: string;
  source: "curated" | "user_quest";
  caption: string | null;
  video_path: string;
  poster_path: string | null;
  created_at: string;
  place: { id: string; slug: string; name: string; area: string | null } | null;
};

export function ReelsFeed() {
  const [reels, setReels] = useState<FeedReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [muted, setMuted] = useState(true);
  const loadingMore = useRef(false);

  const loadMore = useCallback(async (before?: string) => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const qs = before ? `?before=${encodeURIComponent(before)}` : "";
      const res = await fetch(`/api/reels${qs}`);
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { reels: FeedReel[] };
      if (body.reels.length === 0) {
        setExhausted(true);
      } else {
        setReels((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...body.reels.filter((r) => !seen.has(r.id))];
        });
      }
    } catch {
      setExhausted(true);
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, []);

  // Initial page, inline so every setState happens after the await.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reels");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { reels: FeedReel[] };
        if (cancelled) return;
        setReels(body.reels);
        if (body.reels.length === 0) setExhausted(true);
      } catch {
        if (!cancelled) setExhausted(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="halo absolute inset-0" />
        <p className="voice relative">reels</p>
        <h1 className="relative font-display text-3xl italic">
          Proof it happened.
        </h1>
        <p className="relative max-w-xs text-sm text-ink-dim">
          Finished quests become reels, and the best land here. Be the first -
          run a quest this weekend.
        </p>
        <Link
          href="/quests/new"
          className="relative mt-2 rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-night"
        >
          Start one
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full snap-y snap-mandatory overflow-y-auto">
      {reels.map((reel, i) => (
        <ReelSlide
          key={reel.id}
          reel={reel}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onNearEnd={
            i === reels.length - 2 && !exhausted
              ? () => void loadMore(reels[reels.length - 1].created_at)
              : undefined
          }
        />
      ))}
    </div>
  );
}

function ReelSlide({
  reel,
  muted,
  onToggleMute,
  onNearEnd,
}: {
  reel: FeedReel;
  muted: boolean;
  onToggleMute: () => void;
  onNearEnd?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const video = publicMediaUrl("reel-media", reel.video_path);
  const poster = publicMediaUrl("reel-media", reel.poster_path);

  // Play only the on-screen reel; pause the rest. Also trigger pagination.
  useEffect(() => {
    const el = containerRef.current;
    const vid = videoRef.current;
    if (!el || !vid) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void vid.play().catch(() => {});
          onNearEnd?.();
        } else {
          vid.pause();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onNearEnd]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full snap-start items-center justify-center"
    >
      {video && (
        <video
          ref={videoRef}
          src={video}
          poster={poster ?? undefined}
          loop
          muted={muted}
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          onClick={onToggleMute}
        />
      )}

      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={onToggleMute}
        className="absolute right-4 top-4 rounded-full border border-line/60 bg-night/60 p-2 text-ink-dim backdrop-blur"
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>

      <div className="absolute inset-x-4 bottom-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {reel.caption && (
            <p className="line-clamp-2 font-display text-lg italic text-ink drop-shadow">
              {reel.caption}
            </p>
          )}
          {reel.place && (
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-dim">
              <MapPin className="size-3" />
              {[reel.place.name, reel.place.area].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {reel.place && (
          <Link
            href={`/map?place=${encodeURIComponent(reel.place.slug)}`}
            className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-night"
          >
            Do this
          </Link>
        )}
      </div>
    </div>
  );
}
