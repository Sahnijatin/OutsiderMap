import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { PlaceArticle } from "@/lib/blog/place";

/**
 * Member blogs about this place. Renders nothing when there are none - which
 * is also what a signed-out visitor gets, because RLS hides member blogs from
 * anonymous readers entirely. The section must never assume it has rows.
 */
export function PlaceStories({ articles }: { articles: PlaceArticle[] }) {
  if (articles.length === 0) return null;

  return (
    <section className="mt-8">
      <p className="voice mb-3">Stories</p>
      <ul className="flex flex-col gap-2">
        {articles.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/blog/${article.slug}`}
              className="flex items-start gap-3 rounded-card border border-line bg-surface p-4 transition-[transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/50 active:scale-[0.99] motion-reduce:active:scale-100"
            >
              <BookOpen className="mt-1 size-4 shrink-0 text-accent" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-lg italic">{article.title}</span>
                {article.readingMinutes && (
                  <span className="text-xs text-ink-dim">
                    {article.readingMinutes} min read
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
