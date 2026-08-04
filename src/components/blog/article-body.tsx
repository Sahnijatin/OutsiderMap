import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ArticleBlock } from "@/lib/blog/blocks";

/**
 * Renders a blog body. Blocks are a closed union, so every branch is a real
 * element and nothing is ever injected as HTML - there is no
 * dangerouslySetInnerHTML anywhere in this codebase and a member-writing
 * surface is exactly where that would first go wrong.
 *
 * A `place` block whose place didn't resolve (unpublished, deleted) renders
 * nothing rather than a broken card.
 */

export type ArticlePlace = {
  id: string;
  slug: string;
  name: string;
  area: string | null;
};

export function ArticleBody({
  blocks,
  places,
}: {
  blocks: ArticleBlock[];
  places: Map<string, ArticlePlace>;
}) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === "heading") {
          return (
            <h2 key={key} className="mt-2 font-display text-xl italic lg:text-2xl">
              {block.text}
            </h2>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-accent pl-4 font-display text-lg italic text-ink-dim"
            >
              {block.text}
            </blockquote>
          );
        }

        if (block.type === "place") {
          const place = places.get(block.place_id);
          if (!place) return null;
          return (
            <Link
              key={key}
              href={`/place/${place.slug}`}
              className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
            >
              <span className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-accent" />
                <span className="font-display text-lg italic">{place.name}</span>
                {place.area && (
                  <span className="text-sm text-ink-dim">{place.area}</span>
                )}
              </span>
              {block.note && (
                <span className="text-sm text-ink-dim">{block.note}</span>
              )}
            </Link>
          );
        }

        return (
          <p key={key} className="text-[0.975rem] leading-relaxed whitespace-pre-line">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
