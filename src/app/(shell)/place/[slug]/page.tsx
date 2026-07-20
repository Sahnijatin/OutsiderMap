import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navigation } from "lucide-react";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { publicMediaUrl } from "@/lib/media/url";
import { categoryGroup, categoryLabel } from "@/lib/map/categories";
import { googleMapsDirUrl } from "@/lib/map/directions";
import { isOpenNow, openStatusLabel } from "@/lib/places/hours";
import type { Json } from "@/types/database";
import { PlaceGallery, type GalleryCard } from "./place-gallery";

const DETAIL_FIELDS =
  "id, slug, name, area, kind, category, price_level, vibe_tags, description, editor_note, hours, best_for, image_path, story, lat, lng";

type StoryCard = {
  media_path?: string;
  media_type?: "image" | "video";
  caption?: string;
};

type BestFor = {
  moods?: string[];
  times?: string[];
  group?: string[];
};

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

function formatWindow(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
}

function dayHours(hours: Json | null, key: string): string {
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return "—";
  const windows = (hours as Record<string, unknown>)[key];
  if (!Array.isArray(windows) || windows.length === 0) return "Closed";
  return windows
    .map((w) => {
      const win = w as { open?: string; close?: string };
      if (!win.open || !win.close) return null;
      return `${formatWindow(win.open)} – ${formatWindow(win.close)}`;
    })
    .filter(Boolean)
    .join(", ");
}

async function loadPlace(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select(DETAIL_FIELDS)
    .eq("slug", slug)
    .eq("is_published", true)
    .eq("is_chain", false)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const place = await loadPlace(slug);
  if (!place) return { title: "Place" };
  return {
    title: place.name,
    description: place.description ?? undefined,
  };
}

export default async function PlacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireOnboarded();
  const { slug } = await params;
  const place = await loadPlace(slug);
  if (!place) notFound();

  const group = categoryGroup(place.category, place.kind);
  const catLabel = categoryLabel(place.category) ?? place.kind;
  const openLabel = openStatusLabel(place.hours);
  const open = isOpenNow(place.hours);

  // Media: story cards first, cover as the fallback single card.
  const cards: GalleryCard[] = [];
  for (const raw of (place.story as StoryCard[] | null) ?? []) {
    const src = publicMediaUrl("experience-media", raw.media_path);
    if (src) {
      cards.push({
        src,
        type: raw.media_type === "video" ? "video" : "image",
        caption: raw.caption,
      });
    }
  }
  const cover = publicMediaUrl("place-images", place.image_path);
  if (cards.length === 0 && cover) cards.push({ src: cover, type: "image" });

  const bestFor = (place.best_for as BestFor | null) ?? {};
  const bestForTags = [
    ...(bestFor.moods ?? []),
    ...(bestFor.times ?? []),
    ...(bestFor.group ?? []),
  ];

  const dirUrl =
    place.lat != null && place.lng != null
      ? googleMapsDirUrl(place.lat, place.lng, place.name)
      : null;

  const hasHours =
    !!place.hours &&
    typeof place.hours === "object" &&
    !Array.isArray(place.hours);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-[calc(var(--tab-clearance)+2.5rem)] pt-[calc(var(--safe-top)+1.25rem)]">
      <Link
        href={`/map?place=${place.slug}`}
        className="voice inline-flex items-center gap-1 transition-colors hover:text-ink"
      >
        ← Map
      </Link>

      {/* Hero */}
      <header className="relative mt-4 overflow-hidden rounded-card border border-line">
        <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={place.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-surface to-night" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-night via-night/40 to-transparent" />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full ring-1 ring-black/40"
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
          <h1 className="mt-1.5 font-display text-3xl italic sm:text-4xl">
            {place.name}
          </h1>
          <p className="voice mt-2">
            {[
              place.area,
              openLabel,
              place.price_level ? "₹".repeat(place.price_level) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      {/* Primary actions */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {dirUrl && (
          <a
            href={dirUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("primary")}
          >
            <Navigation className="size-4" />
            Directions on Google Maps
          </a>
        )}
        <span
          className={`text-xs ${open ? "text-accent" : "text-ink-dim"}`}
        >
          {open === true
            ? "Open now"
            : open === false
              ? "Closed now"
              : ""}
        </span>
      </div>

      {/* Gallery */}
      {cards.length > 0 && (
        <section className="mt-8">
          <p className="voice mb-3">The scene</p>
          <PlaceGallery cards={cards} name={place.name} />
        </section>
      )}

      {/* Overview */}
      {place.description && (
        <section className="mt-8">
          <p className="voice mb-3">Overview</p>
          <p className="text-base leading-relaxed text-ink-dim">
            {place.description}
          </p>
        </section>
      )}

      {place.editor_note && (
        <blockquote className="mt-6 border-l-2 border-accent/60 pl-4 font-display text-lg italic leading-relaxed text-ink">
          {place.editor_note}
        </blockquote>
      )}

      {place.vibe_tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-1.5">
          {place.vibe_tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}

      {/* Best for */}
      {bestForTags.length > 0 && (
        <section className="mt-8">
          <p className="voice mb-3">Best for</p>
          <div className="flex flex-wrap gap-1.5">
            {bestForTags.map((tag) => (
              <Badge key={tag} variant="accent">
                {tag}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* Hours */}
      {hasHours && (
        <section className="mt-8">
          <p className="voice mb-3">Hours</p>
          <dl className="overflow-hidden rounded-card border border-line">
            {DAYS.map((d, i) => (
              <div
                key={d.key}
                className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                  i > 0 ? "border-t border-line/60" : ""
                }`}
              >
                <dt className="text-ink-dim">{d.label}</dt>
                <dd className="text-ink">{dayHours(place.hours, d.key)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Closing directions CTA */}
      {dirUrl && (
        <div className="mt-10 flex justify-center">
          <a
            href={dirUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("secondary", "lg")}
          >
            <Navigation className="size-4" />
            Take me there
          </a>
        </div>
      )}
    </main>
  );
}
