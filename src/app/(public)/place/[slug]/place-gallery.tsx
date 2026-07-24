"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type GalleryCard = {
  src: string;
  type: "image" | "video";
  caption?: string;
  /**
   * Set on media we do not host. The card becomes a link to the creator's
   * post and shows their handle - that credit is the basis on which we are
   * entitled to show it at all, so it is not optional decoration.
   */
  credit?: { authorName: string; href: string; platformLabel: string };
};

/**
 * The full-page media carousel: images and videos in a snap scroller with
 * arrow controls and dot indicators. Bigger and calmer than the sheet's
 * strip - this is the place given room to breathe.
 */
export function PlaceGallery({
  cards,
  name,
}: {
  cards: GalleryCard[];
  name: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (cards.length === 0) return null;

  function goTo(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(cards.length - 1, i));
    const child = el.children[clamped] as HTMLElement | undefined;
    child?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    setIndex(clamped);
  }

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const child = c as HTMLElement;
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(childCenter - center);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setIndex(nearest);
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card, i) => (
          <figure
            key={i}
            className="relative w-[86%] shrink-0 snap-center overflow-hidden rounded-card border border-line/60 sm:w-[68%]"
          >
            {card.type === "video" ? (
              <video
                src={card.src}
                muted
                loop
                playsInline
                autoPlay
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.src}
                alt={card.caption ?? name}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
              />
            )}
            {(card.caption || card.credit) && (
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/90 to-transparent px-4 pb-3 pt-8 text-xs text-ink">
                {card.caption}
                {card.credit && (
                  <a
                    href={card.credit.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-ink-dim transition-colors hover:text-ink"
                  >
                    {card.credit.authorName} on {card.credit.platformLabel}
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </figcaption>
            )}
          </figure>
        ))}
      </div>

      {cards.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-line bg-night/70 p-2 text-ink backdrop-blur transition-opacity hover:bg-night disabled:pointer-events-none disabled:opacity-0 sm:block"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => goTo(index + 1)}
            disabled={index === cards.length - 1}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full border border-line bg-night/70 p-2 text-ink backdrop-blur transition-opacity hover:bg-night disabled:pointer-events-none disabled:opacity-0 sm:block"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="mt-3 flex justify-center gap-1.5">
            {cards.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show item ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-5 bg-accent" : "w-1.5 bg-line",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
