import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TasteDimensionsSchema } from "@/lib/taste/profile";
import { retryTasteRead } from "@/app/setup/actions";
import { cancelPremium } from "@/app/(marketing)/pricing/actions";
import { revalidatePath } from "next/cache";
import { signOut } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { priceGlyph } from "@/lib/utils";
import { formatOutsiderNumber } from "@/lib/identity/username";

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

  const [{ data: taste }, { data: subscription }] = await Promise.all([
    supabase
      .from("taste_profiles")
      .select("*")
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("tier, status, current_period_end")
      .eq("user_id", profile.id)
      .maybeSingle(),
  ]);

  const parsed = StoredAnswersSchema.safeParse(taste?.quiz_answers);
  const dimensions = parsed.success ? parsed.data.dimensions : undefined;
  const premium =
    subscription?.tier === "premium" && subscription.status === "active";

  async function cancelPremiumAction() {
    "use server";
    await cancelPremium();
    revalidatePath("/profile");
  }

  const learnedSignals =
    taste?.learned_signals &&
    typeof taste.learned_signals === "object" &&
    Object.keys(taste.learned_signals).length > 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-5 pb-24 pt-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="voice text-accent">
            outsider {formatOutsiderNumber(profile.outsider_number)}
            {profile.username ? ` · @${profile.username}` : ""}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">
            {welcome
              ? "Here’s our first read."
              : (profile.display_name ?? "You, mapped.")}
          </h1>
          <p className="voice">Your taste profile · v{taste?.version ?? 1}</p>
        </div>
        <Badge variant={premium ? "under" : "outline"}>
          {premium ? "Premium" : "Free tier"}
        </Badge>
      </header>

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

      <Card className="flex flex-col gap-3">
        <p className="voice">Still learning</p>
        <p className="max-w-lg text-sm leading-relaxed text-ink-dim">
          {learnedSignals
            ? "The profile is updating from how you actually use the city - asks, saves, skips, hours."
            : "Every ask, save, and skip from here on sharpens this profile. The 3am ones count double."}
        </p>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="voice">Membership</p>
          <p className="text-sm text-ink-dim">
            {premium
              ? `Premium · renews ${
                  subscription?.current_period_end
                    ? new Date(
                        subscription.current_period_end,
                      ).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Kolkata",
                      })
                    : "at the end of this period"
                }`
              : "Free tier - Right Now answers, unlimited."}
          </p>
        </div>
        {premium ? (
          <form action={cancelPremiumAction}>
            <button
              type="submit"
              className="text-sm text-ink-dim transition-colors hover:text-danger"
            >
              Cancel premium
            </button>
          </form>
        ) : (
          <Link
            href="/pricing"
            className="text-sm text-under transition-colors hover:underline"
          >
            Go premium →
          </Link>
        )}
      </Card>

      <footer className="flex flex-wrap items-center gap-4 border-t border-line pt-6">
        <Link
          href="/setup?redo=1"
          className="text-sm text-ink-dim transition-colors hover:text-ink"
        >
          Retake the quiz
        </Link>
        <span className="text-line">·</span>
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm text-ink-dim transition-colors hover:text-ink"
          >
            Sign out
          </button>
        </form>
      </footer>
    </main>
  );
}
