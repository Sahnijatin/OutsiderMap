"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Bookmark, BookmarkCheck, Navigation, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { publicMediaUrl } from "@/lib/media/url";
import { categoryGroup, categoryLabel } from "@/lib/map/categories";
import { googleMapsDirUrl } from "@/lib/map/directions";
import type { PlaceFeatureProps } from "./map-canvas";

export type SelectedPlace = PlaceFeatureProps & { lng: number; lat: number };

type StoryCard = {
  media_path?: string;
  media_type?: "image" | "video";
  caption?: string;
};

type Detail = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  kind: string;
  category: string | null;
  price_level: number | null;
  vibe_tags: string[];
  description: string | null;
  editor_note: string | null;
  image_path: string | null;
  story: StoryCard[];
  openLabel: string | null;
};

/**
 * The place tile: slides up over the map with the story carousel, the
 * editor's voice, and the two actions that matter - save it, or start it.
 */
export function PlaceSheet({
  place,
  onClose,
}: {
  place: SelectedPlace;
  onClose: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"save" | "start" | null>(null);
  const [started, setStarted] = useState(false);

  // The parent keys this component by slug, so a new place mounts fresh -
  // no state resets needed here, just the fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/experiences/${place.slug}`);
        if (!res.ok) throw new Error();
        const body = (await res.json()) as Detail;
        if (!cancelled) setDetail(body);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [place.slug]);

  async function interact(action: "save" | "start") {
    setBusy(action);
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, placeId: place.id }),
      });
      if (res.ok) {
        if (action === "save") setSaved(true);
        else setStarted(true);
      }
    } finally {
      setBusy(null);
    }
  }

  const cards: { src: string; type: "image" | "video"; caption?: string }[] =
    [];
  if (detail) {
    for (const card of detail.story ?? []) {
      const src = publicMediaUrl("experience-media", card.media_path);
      if (src) {
        cards.push({
          src,
          type: card.media_type === "video" ? "video" : "image",
          caption: card.caption,
        });
      }
    }
    const cover = publicMediaUrl("place-images", detail.image_path);
    if (cards.length === 0 && cover) {
      cards.push({ src: cover, type: "image" });
    }
  }

  const group = categoryGroup(place.category, place.kind);
  const catLabel = categoryLabel(place.category) ?? place.kind;

  return (
    <AnimatePresence>
      <motion.section
        key={place.slug}
        role="dialog"
        aria-label={place.name}
        initial={reduced ? false : { y: "100%" }}
        animate={{ y: 0 }}
        exit={reduced ? undefined : { y: "100%" }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 500) onClose();
        }}
        className="absolute inset-x-0 bottom-0 z-[1000] mx-auto flex max-h-[70%] w-full max-w-lg flex-col overflow-hidden rounded-t-card border border-b-0 border-line bg-surface/95 backdrop-blur-md"
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full border border-line/70 bg-night/60 p-1.5 text-ink-dim"
        >
          <X className="size-4" />
        </button>

        <div className="overflow-y-auto px-5 pb-6 pt-3">
          <p className="voice">
            {[place.area, detail?.openLabel].filter(Boolean).join(" · ") ||
              place.kind}
          </p>
          <h2 className="mt-1 font-display text-2xl italic">{place.name}</h2>

          <div className="mt-2 flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full ring-1 ring-black/30"
              style={{
                background: `radial-gradient(circle at 35% 30%, ${group.light}, ${group.color} 55%, ${group.dark})`,
              }}
            />
            <span
              className="text-xs font-medium capitalize"
              style={{ color: group.color }}
            >
              {catLabel}
            </span>
          </div>

          {cards.length > 0 && (
            <div className="-mx-1 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
              {cards.map((card, i) => (
                <figure
                  key={i}
                  className="w-64 shrink-0 snap-center overflow-hidden rounded-xl border border-line/60"
                >
                  {card.type === "video" ? (
                    <video
                      src={card.src}
                      muted
                      loop
                      playsInline
                      autoPlay
                      className="aspect-[4/5] w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.src}
                      alt={card.caption ?? place.name}
                      loading="lazy"
                      className="aspect-[4/5] w-full object-cover"
                    />
                  )}
                  {card.caption && (
                    <figcaption className="px-3 py-2 text-xs text-ink-dim">
                      {card.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}

          {!detail && !failed && (
            <div className="flex items-center gap-2 py-6 text-sm text-ink-dim">
              <Spinner className="size-4" /> Reading the file&hellip;
            </div>
          )}
          {failed && (
            <p className="py-4 text-sm text-ink-dim">
              Couldn&rsquo;t load this one. Try again in a moment.
            </p>
          )}

          {detail && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge>{detail.kind}</Badge>
                {detail.price_level && (
                  <Badge>{"₹".repeat(detail.price_level)}</Badge>
                )}
                {detail.vibe_tags.slice(0, 4).map((v) => (
                  <Badge key={v}>{v}</Badge>
                ))}
              </div>

              {detail.description && (
                <p className="mt-3 text-sm leading-relaxed text-ink-dim">
                  {detail.description}
                </p>
              )}
              {detail.editor_note && (
                <p className="mt-3 border-l-2 border-accent/60 pl-3 text-sm italic text-ink">
                  {detail.editor_note}
                </p>
              )}
            </>
          )}

          <div className="mt-5 flex items-center gap-2">
            <Button
              className="flex-1"
              disabled={busy !== null || started}
              onClick={() => interact("start")}
            >
              {busy === "start" ? (
                <Spinner className="border-night/30 border-t-night" />
              ) : null}
              {started ? "Started - it's in your bucket" : "Start this"}
            </Button>
            <Button
              variant="secondary"
              className="w-11 shrink-0 px-0"
              aria-label={saved ? "Saved" : "Save for later"}
              disabled={busy !== null || saved}
              onClick={() => interact("save")}
            >
              {saved ? (
                <BookmarkCheck className="size-4 text-accent" />
              ) : (
                <Bookmark className="size-4" />
              )}
            </Button>
            <Button
              variant="secondary"
              className="w-11 shrink-0 px-0"
              aria-label="Directions on Google Maps"
              onClick={() =>
                window.open(
                  googleMapsDirUrl(place.lat, place.lng, place.name),
                  "_blank",
                  "noopener",
                )
              }
            >
              <Navigation className="size-4" />
            </Button>
          </div>

          <ButtonLink
            href={`/place/${place.slug}`}
            variant="secondary"
            className="mt-2 w-full"
          >
            View more <ArrowUpRight className="size-4" />
          </ButtonLink>
        </div>
      </motion.section>
    </AnimatePresence>
  );
}
