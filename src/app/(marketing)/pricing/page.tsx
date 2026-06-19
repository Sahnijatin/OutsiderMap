import type { Metadata } from "next";
import { getUser, isPremium } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubscribeButton } from "./subscribe-button";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Right Now answers are free, forever. Premium adds the Weekend Planner and underground access for ₹499/month.",
};

const freeFeatures = [
  "Your taste profile, always learning",
  "Right Now mode - unlimited asks",
  "Save places, build your shortlist",
];

const premiumFeatures = [
  "Everything in free",
  "Weekend Planner - Fri to Sun, built around you",
  "Underground access - events that aren't on Google",
  "Tonight's underground folded into Right Now answers",
];

export default async function PricingPage() {
  const user = await getUser();
  const premium = user ? await isPremium() : false;

  return (
    <main className="mx-auto max-w-4xl px-6 pb-28 pt-36">
      <header className="flex flex-col items-center gap-4 text-center">
        <p className="voice">Pricing</p>
        <h1 className="max-w-xl font-display text-4xl sm:text-5xl">
          The answer is free.{" "}
          <span className="italic text-under">The city after dark isn’t.</span>
        </h1>
      </header>

      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-6 rounded-card border border-line bg-surface p-8">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-2xl">Free</h2>
            <p className="font-mono text-sm text-ink-dim">₹0 · forever</p>
          </div>
          <ul className="flex flex-1 flex-col gap-3">
            {freeFeatures.map((feature) => (
              <li key={feature} className="text-sm leading-relaxed text-ink-dim">
                <span aria-hidden className="mr-2 text-accent">·</span>
                {feature}
              </li>
            ))}
          </ul>
          {user ? (
            <ButtonLink href="/now" variant="secondary">
              You have this - go ask
            </ButtonLink>
          ) : (
            <ButtonLink href="/sign-in" variant="secondary">
              Start free
            </ButtonLink>
          )}
        </div>

        <div className="relative flex flex-col gap-6 overflow-hidden rounded-card border border-under/40 bg-surface p-8">
          <div className="halo-under absolute inset-0" />
          <div className="relative flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-2xl">Premium</h2>
              <Badge variant="under">after dark</Badge>
            </div>
            <p className="font-mono text-sm text-ink-dim">
              ₹499/month · UPI Autopay · cancel anytime
            </p>
          </div>
          <ul className="relative flex flex-1 flex-col gap-3">
            {premiumFeatures.map((feature) => (
              <li key={feature} className="text-sm leading-relaxed text-ink-dim">
                <span aria-hidden className="mr-2 text-under">·</span>
                {feature}
              </li>
            ))}
          </ul>
          <div className="relative">
            {premium ? (
              <ButtonLink href="/weekend" variant="under">
                You&rsquo;re in - plan the weekend
              </ButtonLink>
            ) : user ? (
              <SubscribeButton />
            ) : (
              <ButtonLink href="/sign-in?next=/pricing" variant="under" size="lg">
                Sign in to go premium
              </ButtonLink>
            )}
          </div>
        </div>
      </div>

      <p className="mt-10 text-center font-mono text-xs text-ink-dim/60">
        Billed by Razorpay. Cancel from your profile - access runs to the end
        of the period.
      </p>
    </main>
  );
}
