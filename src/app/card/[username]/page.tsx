import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatOutsiderNumber } from "@/lib/identity/username";
import { getPublicTasteCard } from "@/lib/taste/card";

/**
 * Public shareable taste card (#121). Anon-viewable — the "here's OutsiderMap's
 * read on me" landing a shared link points at. The dynamic opengraph-image in
 * this segment supplies the social preview. Only renders taste for members who
 * opted in (public_taste_card returns null otherwise).
 */

async function loadCard(username: string) {
  const supabase = await createClient();
  return getPublicTasteCard(supabase, username);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const card = await loadCard(username);
  if (!card) return { title: "Taste card" };
  const who = card.displayName ?? `@${card.username}`;
  return {
    title: `${who}'s taste`,
    description: card.tasteSummary.slice(0, 160),
    alternates: { canonical: `/card/${card.username}` },
  };
}

export default async function TasteCardPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const card = await loadCard(username);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="halo absolute inset-0 -z-10" />
      {card ? (
        <>
          <p className="voice text-accent">
            outsider {formatOutsiderNumber(card.outsiderNumber)}
          </p>
          <h1 className="font-display text-3xl italic sm:text-4xl">
            {card.displayName ?? `@${card.username}`}
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-ink">
            {card.tasteSummary}
          </p>
          {card.vibeKeywords.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {card.vibeKeywords.map((v) => (
                <Badge key={v} variant="accent">
                  {v}
                </Badge>
              ))}
            </div>
          )}
          <p className="voice mt-2">
            {card.cityName ? `${card.cityName} · ` : ""}OutsiderMap
          </p>
          <Link href="/map" className={buttonClasses("primary")}>
            Get your own taste read →
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl italic">
            This taste card isn&rsquo;t shared.
          </h1>
          <p className="max-w-sm text-sm text-ink-dim">
            It might be private, or the link&rsquo;s gone cold. Either way, your
            own read is one quiz away.
          </p>
          <Link href="/map" className={buttonClasses("primary")}>
            Find your taste →
          </Link>
        </>
      )}
    </main>
  );
}
