import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What OutsiderMap collects, why, how long it is kept, and the rights you have over it.",
};

/**
 * Privacy policy - a store-submission and DPDP requirement, written honestly
 * against what the product actually collects. Marked as a draft until counsel
 * signs off; the draft banner and the grievance-officer placeholder must be
 * resolved before launch.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-ink-dim">
        <span className="font-semibold text-ink">Draft.</span> This policy is
        pending legal review and may change before it is final. It describes
        what the product does today, in plain language.
      </p>

      <h1 className="mt-8 font-display text-3xl italic">Privacy policy</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-dim">
        OutsiderMap exists to answer one question: where should you go, right
        now. To do that well it has to learn your taste, and that means holding
        some of your data. This page says exactly what we collect, why, how
        long we keep it, and how you get rid of it. It is written for the
        Digital Personal Data Protection Act, 2023 (DPDP) and for common sense.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">What we collect</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-dim">
          <li>
            <span className="text-ink">Account details.</span> Your email
            address and the profile you set up (name, username, photo if you
            add one). This is how you sign in and how other members see you.
          </li>
          <li>
            <span className="text-ink">Location, when you grant it.</span> Used
            to center the map on you, find places near you, and verify spots
            you scout on-site. The app works without it; the map is just less
            useful. You can revoke the permission in your device settings at
            any time.
          </li>
          <li>
            <span className="text-ink">
              Your taste profile and interaction history.
            </span>{" "}
            Your onboarding answers and what you do in the app (places you
            view, save, visit, skip). This is the raw material of the
            recommendation engine; without it we would be a generic list.
          </li>
          <li>
            <span className="text-ink">Photos and camera uploads.</span> Photos
            you attach to posts and the live photos you take to verify a spot.
            They are stored with your account and shown where you chose to
            share them. Uploads pass through moderation before they are public.
          </li>
          <li>
            <span className="text-ink">Device push tokens.</span> If you allow
            notifications, we store the token your device gives us so we can
            send them. Signing out releases the token.
          </li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-ink-dim">
          We do not buy data about you, we do not sell data about you, and we
          do not run third-party advertising trackers.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Why we use it</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Three purposes, and only these: to run the product (accounts, the
          map, posts, quests, notifications you asked for); to personalize it
          (your taste profile and history power the recommendations); and to
          keep it safe (moderation of uploads, abuse prevention, and the
          verification that keeps scout submissions honest). We do not use
          your data for anything that is not part of the product you can see.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">How long we keep it</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          For as long as you have an account, so the product keeps working for
          you. When you delete your account, your personal data is deleted with
          it (see below). Operational logs and backups age out on a rolling
          basis. Where the law requires us to retain something for longer, we
          retain only that and only for as long as required.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Your rights</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          You can see and edit your profile and taste settings in the app. You
          can delete your account yourself, in the app, from your profile
          settings: deletion is immediate, requires a typed confirmation, and
          purges your personal data, not just the login. You do not have to
          email anyone or wait for an operator. Under the DPDP Act you also
          have the right to correction, the right to grievance redressal, and
          the right to nominate a person to exercise these rights for you.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Grievances</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          If you believe we have mishandled your data, contact our grievance
          officer: [grievance officer contact to be appointed]. We will
          acknowledge and respond within the timelines the DPDP Act requires.
          If you are not satisfied with our response, you may escalate to the
          Data Protection Board of India.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Changes</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          If this policy changes in a way that matters, we will say so in the
          app before the change takes effect. The current version always lives
          at this address. See also our{" "}
          <Link href="/terms" className="text-ink underline hover:text-accent">
            terms of use
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
