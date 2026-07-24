"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsNativeApp } from "@/lib/capacitor/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * The shared sign-in flow, used by both the /sign-in page and the inline auth
 * modal (#116). On OTP success it either runs `onSignedIn` (the modal resumes
 * the pending action in place) or navigates to `next`.
 *
 * On the web: email code + Google. Google is a full-page redirect, so a JS
 * closure can't survive it — we stash `next` in a short-lived cookie before
 * redirecting and the callback reads it (also fixes the "OAuth drops ?next" gap).
 *
 * In the native app (#149): the email-code flow stays entirely in-app, so that's
 * all we show. Web-redirect Google would kick the user out to a browser, which
 * we don't want on mobile — native Google/Apple sign-in sheets come next, gated
 * on their native client IDs.
 */

/** Cookie the OAuth callback reads to restore the intended destination. */
const NEXT_COOKIE = "om_auth_next";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35z"
      />
      <path
        fill="currentColor"
        d="M12 22c2.7 0 4.964-.895 6.618-2.423l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.595-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22z"
        opacity="0.8"
      />
      <path
        fill="currentColor"
        d="M6.405 13.9a6.01 6.01 0 0 1 0-3.8V7.51H3.064a9.996 9.996 0 0 0 0 8.98L6.405 13.9z"
        opacity="0.6"
      />
      <path
        fill="currentColor"
        d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.959 2.99 14.695 2 12 2a9.996 9.996 0 0 0-8.936 5.51L6.405 10.1C7.19 7.736 9.395 5.977 12 5.977z"
        opacity="0.9"
      />
    </svg>
  );
}

type Step = "email" | "code";

export function SignInPanel({
  next = "/map",
  onSignedIn,
  initialError,
}: {
  /** Where the OTP path navigates on success (ignored when onSignedIn is set). */
  next?: string;
  /** When provided (the modal), resume in place instead of navigating. */
  onSignedIn?: () => void;
  initialError?: string | null;
}) {
  const router = useRouter();
  const isNative = useIsNativeApp();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setPending(false);
    if (error) {
      setError("That code didn’t match. Check the email and try again.");
      return;
    }
    if (onSignedIn) {
      onSignedIn();
      router.refresh();
    } else {
      router.push(next);
      router.refresh();
    }
  }

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    // Stash the destination for the callback (OAuth can't carry ?next reliably).
    document.cookie = `${NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`;
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setPending(false);
      setError(error.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Web: Google redirect. Hidden in the native app — it would leave to a
          browser; native social sign-in sheets land next (#149). */}
      {!isNative && (
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={signInWithGoogle}
            disabled={pending}
          >
            <GoogleIcon />
            Continue with Google
          </Button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="font-mono text-xs text-ink-dim">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={pending || !email}>
            {pending ? <Spinner className="border-night/30 border-t-night" /> : null}
            Email me a code
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <p className="text-sm text-ink-dim">
            We sent a six-digit code to{" "}
            <span className="text-ink">{email}</span>.
          </p>
          <label htmlFor="code" className="sr-only">
            Six-digit code
          </label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="000000"
            className="text-center font-mono text-lg tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <Button type="submit" disabled={pending || code.length !== 6}>
            {pending ? <Spinner className="border-night/30 border-t-night" /> : null}
            Sign in
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep("email");
              setCode("");
            }}
          >
            Use a different email
          </Button>
        </form>
      )}

      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  );
}
