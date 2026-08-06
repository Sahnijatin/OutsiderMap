"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MINIMUM_AGE_YEARS } from "@/lib/consent/age";
import { withdrawablePurposes } from "@/lib/consent/purposes";
import { PRIVACY_POLICY_VERSION } from "@/lib/consent/policy";
import { acceptNotice } from "./actions";

/**
 * Step 0: the notice, the age gate and itemized consent, in one screen.
 *
 * One screen rather than three, deliberately. DPDP wants consent that is
 * informed and specific, and a member who has been walked through three
 * consecutive interstitials before they have seen the product is a member
 * clicking Next. Everything they are agreeing to is visible at once, each
 * purpose has its own checkbox, and the optional ones start UNCHECKED - a
 * pre-ticked box is not consent freely given.
 */
export function NoticeStep({
  maxDate,
  // True on the recovery path: the date of birth is already recorded (it is
  // one-shot) and only the consent write is outstanding. Asking for it again
  // would be asking for something we are going to ignore.
  dobRecorded = false,
}: {
  maxDate: string;
  dobRecorded?: boolean;
}) {
  const router = useRouter();
  const [dob, setDob] = useState("");
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const optional = useMemo(() => withdrawablePurposes(), []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await acceptNotice({ dateOfBirth: dob, purposes: granted });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 pb-10 pt-[calc(var(--safe-top)+2.5rem)]">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          before we start
        </span>
        <h1 className="font-display text-3xl italic">
          What we&rsquo;ll hold, and what&rsquo;s yours to refuse.
        </h1>
        <p className="text-sm leading-relaxed text-ink-dim">
          OutsiderMap learns your taste to answer one question well: where
          should you go, right now. That means holding some of your data. Here
          is the short version - the{" "}
          <Link href="/privacy" className="text-ink underline hover:text-accent">
            full privacy policy
          </Link>{" "}
          has the rest.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-6">
        {!dobRecorded && (
          <div className="flex flex-col gap-2">
            <label htmlFor="dob" className="text-sm font-medium text-ink">
              Your date of birth
            </label>
            <Input
              id="dob"
              type="date"
              required
              max={maxDate}
              value={dob}
              onChange={(e) => {
                setDob(e.target.value);
                setError(null);
              }}
            />
            <p className="text-xs leading-relaxed text-ink-dim">
              OutsiderMap is for {MINIMUM_AGE_YEARS}s and over. The law does not
              let us build a taste profile for a child, and a taste profile is
              the whole product - so we ask once, and we keep the date only to
              show we asked.
            </p>
          </div>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-ink">
            What you&rsquo;re agreeing to
          </legend>
          <p className="text-xs leading-relaxed text-ink-dim">
            Running your account is the product itself - signing in, the map,
            the places you save, and keeping members safe. Everything below is
            separate, and separately yours to refuse. You can change any of it
            later from your profile.
          </p>

          {optional.map((spec) => (
            <label
              key={spec.purpose}
              className="flex cursor-pointer gap-3 rounded-card border border-line bg-surface p-3"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-accent"
                checked={granted[spec.purpose] === true}
                onChange={(e) =>
                  setGranted((prev) => ({
                    ...prev,
                    [spec.purpose]: e.target.checked,
                  }))
                }
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">
                  {spec.label}
                </span>
                <span className="text-xs leading-relaxed text-ink-dim">
                  {spec.description}
                </span>
              </span>
            </label>
          ))}

          <p className="text-xs leading-relaxed text-ink-dim">
            Say no to everything and the app still works - it just answers like
            it has never met you.
          </p>
        </fieldset>

        <Button type="submit" disabled={pending || (!dob && !dobRecorded)}>
          {pending ? <Spinner className="border-night/30 border-t-night" /> : null}
          Agree and continue
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}

        <p className="text-center font-mono text-[0.65rem] uppercase tracking-[0.15em] text-ink-dim">
          policy version {PRIVACY_POLICY_VERSION}
        </p>
      </form>
    </div>
  );
}

/**
 * The re-consent screen: shown when the policy has changed materially since
 * the version this member accepted, and to everyone carried over by the
 * migration-57 backfill (whose recorded version is 'legacy', which is not
 * evidence of anything).
 *
 * Only the essential purpose is restamped. Their per-purpose choices survive -
 * a policy revision is not an excuse to re-ask for everything and hope.
 */
export function ReconsentStep({
  action,
}: {
  action: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 pb-10 pt-[calc(var(--safe-top)+2.5rem)]">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          our privacy policy changed
        </span>
        <h1 className="font-display text-3xl italic">
          Worth two minutes of your time.
        </h1>
        <p className="text-sm leading-relaxed text-ink-dim">
          We&rsquo;ve updated what we collect and why. Nothing you already chose
          has changed - your personalization settings are exactly where you left
          them. Read the{" "}
          <Link href="/privacy" className="text-ink underline hover:text-accent">
            updated policy
          </Link>
          , then confirm below.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await action();
              if (!result.ok) {
                setError(result.error ?? "Couldn't save that. Try again.");
                return;
              }
              router.refresh();
            })
          }
        >
          {pending ? <Spinner className="border-night/30 border-t-night" /> : null}
          I&rsquo;ve read it
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
        <p className="text-center font-mono text-[0.65rem] uppercase tracking-[0.15em] text-ink-dim">
          policy version {PRIVACY_POLICY_VERSION}
        </p>
      </div>
    </div>
  );
}
