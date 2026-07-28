import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TasteDimensionsSchema } from "@/lib/taste/profile";
import { retryTasteRead } from "@/app/setup/actions";
import { signOut } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { priceGlyph } from "@/lib/utils";
import { resolveCity } from "@/lib/cities";
import {
  DangerZone,
  FeelCard,
  PersonalizationToggle,
  SignOutForm,
} from "./settings-cards";
import { MemoryCard } from "./memory-card";
import { TasteCardShare } from "./taste-card-share";
import { IdentityCard } from "./identity-card";
import { StatsRow } from "./stats-row";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Screen } from "@/components/app/screen";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Your taste profile",
};

const StoredAnswersSchema = z.object({
  dimensions: TasteDimensionsSchema.optional(),
});

const SOCIAL_LABELS: Record<string, string> = {
  solo: "happiest solo",
  intimate: "two-to-four people",
  social: "runs with a table",
  "crowd-seeking": "wants the whole room",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const profile = await requireOnboarded();
  const { welcome } = await searchParams;
  const supabase = await createClient();

  const [
    { data: taste },
    { data: bucket },
    { count: questCount },
    { count: savedCount },
    { count: followerCount },
    { count: followingCount },
    city,
    { data: memories },
  ] = await Promise.all([
    supabase
      .from("taste_profiles")
      .select("*")
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase
      .from("saved_places")
      .select("place_id, status, place:places(slug, name, area)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("quests")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    supabase
      .from("saved_places")
      .select("place_id", { count: "exact", head: true })
      .eq("user_id", profile.id),
    supabase
      .from("follows")
      .select("follower", { count: "exact", head: true })
      .eq("followee", profile.id),
    supabase
      .from("follows")
      .select("followee", { count: "exact", head: true })
      .eq("follower", profile.id),
    resolveCity(supabase, profile.home_city),
    // Everything the concierge has written down, including anything expired -
    // a fact that has quietly aged out is still something the member should be
    // able to see was once recorded and strike off for good.
    supabase
      .from("member_memory")
      .select("id, kind, text")
      .eq("user_id", profile.id)
      .order("confidence", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const parsed = StoredAnswersSchema.safeParse(taste?.quiz_answers);
  const dimensions = parsed.success ? parsed.data.dimensions : undefined;

  const learnedSignals =
    taste?.learned_signals &&
    typeof taste.learned_signals === "object" &&
    Object.keys(taste.learned_signals).length > 0;

  return (
    <Screen width="wide" className="flex flex-col gap-10">
      <PageHeader
        eyebrow={`Your taste profile · v${taste?.version ?? 1}`}
        title={
          welcome
            ? "Here’s our first read."
            : (profile.display_name ?? "You, mapped.")
        }
      />

      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-5 lg:items-start lg:gap-8">
      <div className="flex flex-col gap-5 lg:sticky lg:top-8 lg:col-span-2">
        <IdentityCard
          username={profile.username}
          outsiderNumber={profile.outsider_number}
          displayName={profile.display_name}
          memberSince={profile.created_at}
          cityName={city.name}
        />
        <StatsRow
          quests={questCount ?? 0}
          saved={savedCount ?? 0}
          followers={followerCount ?? 0}
          following={followingCount ?? 0}
        />
      </div>

      <div className="flex flex-col gap-10 lg:col-span-3">
      {taste?.taste_summary ? (
        <blockquote className="border-l-2 border-accent pl-6 font-display text-xl leading-relaxed sm:text-2xl">
          {taste.taste_summary}
        </blockquote>
      ) : (
        <Card className="flex flex-col items-start gap-4">
          <p className="voice">Still reading you</p>
          <p className="max-w-lg text-sm leading-relaxed text-ink-dim">
            Your answers are saved, but the written read didn&rsquo;t finish.
            Run it again - it takes about twenty seconds.
          </p>
          <form action={retryTasteRead}>
            <Button type="submit" variant="secondary" size="sm">
              Finish my profile
            </Button>
          </form>
        </Card>
      )}

      {dimensions && (
        <section className="grid gap-6 sm:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <p className="voice">The shape of it</p>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-dim">Adventurousness</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-28 overflow-hidden rounded-full bg-line"
                    role="img"
                    aria-label={`${Math.round(dimensions.adventurousness * 100)} percent`}
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.round(dimensions.adventurousness * 100)}%`,
                      }}
                    />
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-dim">Damage tolerance</dt>
                <dd className="font-mono text-accent">
                  {priceGlyph(dimensions.budget_band)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-dim">Company</dt>
                <dd>
                  {SOCIAL_LABELS[dimensions.social_energy] ??
                    dimensions.social_energy}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-ink-dim">Hours kept</dt>
                <dd className="font-mono text-xs">
                  {dimensions.preferred_times.join(" · ")}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="flex flex-col gap-4">
            <p className="voice">Your words, our tags</p>
            <div className="flex flex-wrap gap-2">
              {dimensions.vibe_keywords.map((keyword) => (
                <Badge key={keyword} variant="accent">
                  {keyword}
                </Badge>
              ))}
              {dimensions.cuisine_leanings.map((cuisine) => (
                <Badge key={cuisine}>{cuisine}</Badge>
              ))}
            </div>
            {dimensions.areas.length > 0 && (
              <p className="text-sm text-ink-dim">
                Territory: {dimensions.areas.join(", ")}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-4 sm:col-span-2">
            <p className="voice">What we&rsquo;re holding onto</p>
            <ul className="flex flex-col gap-2">
              {dimensions.anchors.map((anchor) => (
                <li key={anchor} className="text-sm leading-relaxed">
                  <span aria-hidden className="mr-2 text-accent">·</span>
                  {anchor}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {taste?.taste_summary && (
        <TasteCardShare
          username={profile.username}
          initialPublic={profile.taste_card_public}
        />
      )}

      <Card className="flex flex-col gap-3">
        <p className="voice">Still learning</p>
        <p className="max-w-lg text-sm leading-relaxed text-ink-dim">
          {learnedSignals
            ? "The profile is updating from how you actually use the city - asks, saves, skips, hours."
            : "Every ask, save, and skip from here on sharpens this profile. The 3am ones count double."}
        </p>
      </Card>


      <section className="flex flex-col gap-3">
        <h2 className="voice">Your bucket</h2>
        {bucket && bucket.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {bucket.map((row) => (
              <li key={row.place_id}>
                <Link
                  href={`/map?place=${encodeURIComponent(row.place?.slug ?? "")}`}
                  className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 transition-colors hover:border-accent/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {row.place?.name ?? "A place"}
                    </p>
                    {row.place?.area && (
                      <p className="text-xs text-ink-dim">{row.place.area}</p>
                    )}
                  </div>
                  <Badge
                    variant={
                      row.status === "completed"
                        ? "accent"
                        : row.status === "started"
                          ? "under"
                          : "outline"
                    }
                  >
                    {row.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing saved yet."
            body="Tap a light on the map and save what calls to you - it collects here."
            action={
              <ButtonLink href="/map" variant="secondary">
                Open the map
              </ButtonLink>
            }
          />
        )}
      </section>
      </div>
      </div>

      <FeelCard />

      <MemoryCard initial={memories ?? []} />

      <PersonalizationToggle
        initial={profile.personalization_enabled !== false}
      />

      <DangerZone username={profile.username} />

      <footer className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <Link
          href="/setup?redo=1"
          className="text-sm text-ink-dim transition-colors hover:text-ink"
        >
          Retake the quiz
        </Link>
        <span className="text-line">·</span>
        <SignOutForm action={signOut} />
      </footer>
    </Screen>
  );
}
