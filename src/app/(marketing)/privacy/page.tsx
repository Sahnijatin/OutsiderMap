import type { Metadata } from "next";
import Link from "next/link";
import { PROCESSORS } from "@/lib/consent/processors";
import { PURPOSES } from "@/lib/consent/purposes";
import { grievanceOfficer } from "@/lib/consent/officer";
import {
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_VERSION,
} from "@/lib/consent/policy";
import { RETENTION_RULES, UNDERAGE_RECORD_DAYS } from "@/lib/account/retention";
import { retainedTables } from "@/lib/account/personal-data";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What OutsiderMap collects, why, how long it is kept, and the rights you have over it.",
};

/**
 * Privacy policy - a store-submission and DPDP requirement, written honestly
 * against what the product actually collects.
 *
 * The retention table, the purpose list, the processor register and the
 * "what survives deletion" list are RENDERED FROM THE CONSTANTS THE APP
 * ENFORCES, not retyped here. That is the point: this page used to promise
 * that operational data "ages out on a rolling basis" while nothing aged out
 * at all. A claim that is generated from the mechanism cannot drift from it.
 *
 * Still marked as a draft until counsel signs off; the banner and the
 * unappointed grievance officer are the last two manual items.
 */
export default function PrivacyPage() {
  const officer = grievanceOfficer();
  const retained = retainedTables();
  const effective = new Date(PRIVACY_POLICY_EFFECTIVE).toLocaleDateString(
    "en-IN",
    { day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="rounded-card border border-line bg-surface p-4 text-xs leading-relaxed text-ink-dim">
        <span className="font-semibold text-ink">Draft.</span> This policy is
        pending legal review and may change before it is final. It describes
        what the product does today, in plain language.
      </p>

      <h1 className="mt-8 font-display text-3xl italic">Privacy policy</h1>
      <p className="mt-2 font-mono text-xs uppercase tracking-[0.15em] text-ink-dim">
        version {PRIVACY_POLICY_VERSION} · effective {effective}
      </p>
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
            <span className="text-ink">Your date of birth.</span> Collected once
            when you join, and used for one thing only: checking that you are
            18 or over. See <em>Children</em> below.
          </li>
          <li>
            <span className="text-ink">Location, when you grant it.</span> Used
            to center the map on you, find places near you, and verify spots
            you scout on-site. We store the area you are in, not your exact
            coordinates. The app works without it; the map is just less useful.
            You can revoke the permission in your device settings at any time.
          </li>
          <li>
            <span className="text-ink">
              Your taste profile and interaction history.
            </span>{" "}
            Your onboarding answers and what you do in the app (places you
            view, save, visit, skip). This is the raw material of the
            recommendation engine; without it we would be a generic list. Only
            collected if you agree to it, and it stops the moment you say so.
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
        <h2 className="font-display text-xl italic">
          Why we use it, and what you agreed to
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          When you join we ask separately about each of these. Only the first
          is required - it is the product itself. Everything else you can
          refuse at signup and switch off later from your profile, and refusing
          does not cost you access to anything else.
        </p>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-dim">
          {PURPOSES.map((purpose) => (
            <li key={purpose.purpose}>
              <span className="text-ink">{purpose.label}.</span>{" "}
              {purpose.required ? (
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-accent">
                  required
                </span>
              ) : (
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-ink-dim">
                  optional
                </span>
              )}{" "}
              {purpose.description}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-ink-dim">
          We keep a record of what you agreed to, when, and against which
          version of this policy - you can see that record in your data export.
          If we change this policy in a way that materially affects what you
          agreed to, we will ask you again before the change applies to you.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Children</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          OutsiderMap is for people aged 18 and over. The DPDP Act prohibits
          behavioural tracking and targeted advertising directed at children,
          and behavioural learning is how this product works - so rather than
          build a version we could not honestly operate, we do not accept
          under-18s at all. We ask for your date of birth once, at signup, and
          use it for nothing else. If it shows you are under 18 we refuse the
          account, keep no profile, quiz answers or history, and delete the
          record of the refusal after {UNDERAGE_RECORD_DAYS} days.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">How long we keep it</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          For as long as you have an account, so the product keeps working for
          you - except for the operational records below, which are deleted on
          a schedule by a job that runs every night.
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-dim">
          {RETENTION_RULES.map((rule) => (
            <li key={rule.table}>
              <span className="text-ink">{rule.label}.</span>{" "}
              {rule.days === 0
                ? "Deleted as soon as it expires."
                : `Deleted after ${rule.days} days.`}{" "}
              {rule.reason}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-ink-dim">
          Where the law requires us to retain something for longer, we retain
          only that and only for as long as required.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">
          Who else touches your data
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          We use the following companies to run the product. They process your
          data on our instructions and for no purpose of their own. Several of
          them operate outside India; the DPDP Act permits this except to
          countries the government has specifically restricted, and we do not
          transfer data to any restricted country.
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-dim">
          {PROCESSORS.map((processor) => (
            <li key={processor.name}>
              <span className="text-ink">{processor.name}</span> ({processor.country}).{" "}
              {processor.purpose} Data shared: {processor.dataShared.join(", ")}.
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Your rights</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-dim">
          <li>
            <span className="text-ink">See what we hold.</span> Download
            everything, as a machine-readable file, from your profile settings.
            It includes your data, your consent history, who we share it with,
            and how long each thing is kept.
          </li>
          <li>
            <span className="text-ink">Delete your account.</span> In the app,
            from your profile settings. Deletion is immediate, requires a typed
            confirmation, and purges your personal data, not just the login.
            You do not have to email anyone or wait for an operator.
          </li>
          <li>
            <span className="text-ink">Correct what is wrong.</span> Your
            display name, bio and home area are editable directly. A fact the
            concierge has remembered can be deleted from your profile. Retaking
            the quiz rewrites your taste profile. For anything you cannot
            change yourself - your username, date of birth, or email - use
            &ldquo;Request a correction&rdquo; in your profile settings.
          </li>
          <li>
            <span className="text-ink">Take back your consent.</span> Every
            optional purpose above has its own switch in your profile. Turning
            one off deletes what it was holding - we do not simply stop looking
            at it.
          </li>
          <li>
            <span className="text-ink">Nominate someone.</span> You can name a
            person to exercise these rights for you if you die or become unable
            to. They cannot sign in or act on your account; they contact our
            grievance officer, who verifies their claim against what you
            recorded.
          </li>
          <li>
            <span className="text-ink">Complain.</span> See below.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">
          What survives deleting your account
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Almost nothing - but not quite nothing, and you should know which.
          Each of these is either a record the law requires us to keep, or
          something other members depend on. In every case your identity is
          removed from it.
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-dim">
          {retained.map((entry) => (
            <li key={entry.table}>
              <span className="text-ink">{entry.label}.</span>{" "}
              {entry.retainReason}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Grievances</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          If you believe we have mishandled your data, contact our grievance
          officer
          {officer ? (
            <>
              , {officer.name}, at{" "}
              <a
                href={`mailto:${officer.email}`}
                className="text-ink underline hover:text-accent"
              >
                {officer.email}
              </a>
              {officer.address ? ` (${officer.address})` : ""}.
            </>
          ) : (
            <>
              {" "}
              <span className="text-ink">
                [grievance officer to be appointed]
              </span>
              .
            </>
          )}{" "}
          We will acknowledge and respond within the timelines the DPDP Act
          requires. If you are not satisfied with our response, you may
          escalate to the Data Protection Board of India.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl italic">Changes</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          This is version {PRIVACY_POLICY_VERSION}. If this policy changes in a
          way that materially affects what you agreed to, we will ask you to
          read and accept it again the next time you open the app - your
          existing choices about the optional purposes carry over untouched.
          Smaller corrections update this page without interrupting you. See
          also our{" "}
          <Link href="/terms" className="text-ink underline hover:text-accent">
            terms of use
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
