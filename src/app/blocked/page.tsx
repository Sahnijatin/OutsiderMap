import type { Metadata } from "next";
import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { grievanceOfficer } from "@/lib/consent/officer";
import { UNDERAGE_RECORD_DAYS } from "@/lib/account/retention";

export const metadata: Metadata = {
  title: "Not yet",
  robots: { index: false, follow: false },
};

/**
 * The terminal screen for an account refused at the age gate.
 *
 * Two things this page must not do. It must not call requireOnboarded(), which
 * would redirect it back here forever. And it must not be added to
 * PROTECTED_PREFIXES in src/proxy.ts - it renders for someone whose session we
 * have just dropped, so walling it bounces them to /sign-in and back again.
 * tests/auth/protected-prefixes.test.ts pins that second one.
 *
 * The tone is deliberate. A 16-year-old who wanted to find somewhere to go is
 * not a threat actor, and the honest answer is "not yet", not "denied".
 */
export default async function BlockedPage() {
  const profile = await getProfile();
  const officer = grievanceOfficer();

  // Anyone else who lands here - signed out, or blocked for another reason -
  // gets the same page without the age-specific copy.
  const underage = profile?.blocked_reason === "underage";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16">
      <h1 className="font-display text-3xl italic">
        {underage ? "Come back on your birthday." : "This account is closed."}
      </h1>

      {underage ? (
        <>
          <p className="text-sm leading-relaxed text-ink-dim">
            OutsiderMap is for 18s and over. It works by learning your taste
            from what you do in the app, and the Digital Personal Data
            Protection Act does not allow us to build that kind of profile for
            anyone under 18. There is no version of this product we can offer
            you yet without breaking that rule.
          </p>
          <p className="text-sm leading-relaxed text-ink-dim">
            We have kept your date of birth and nothing else - no profile, no
            quiz answers, no history. That record is deleted automatically
            after {UNDERAGE_RECORD_DAYS} days, and you are welcome to sign up
            again once you turn 18.
          </p>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-ink-dim">
          This account can no longer be used. If you think that is a mistake,
          the contact below will reach a person.
        </p>
      )}

      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-sm font-medium text-ink">Think we got this wrong?</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-dim">
          {officer ? (
            <>
              Write to {officer.name}, our grievance officer, at{" "}
              <a
                href={`mailto:${officer.email}`}
                className="text-ink underline hover:text-accent"
              >
                {officer.email}
              </a>
              . A mistyped date of birth is a correction request, and they can
              put it right.
            </>
          ) : (
            <>
              Our grievance officer has not been appointed yet. Until then,
              please use the contact route listed on our{" "}
              <Link
                href="/privacy"
                className="text-ink underline hover:text-accent"
              >
                privacy policy
              </Link>
              .
            </>
          )}
        </p>
      </div>

      <p className="text-xs text-ink-dim">
        <Link href="/privacy" className="underline hover:text-accent">
          Privacy policy
        </Link>
        {" · "}
        <Link href="/terms" className="underline hover:text-accent">
          Terms
        </Link>
      </p>
    </main>
  );
}
