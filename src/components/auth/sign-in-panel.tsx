"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCapacitorPlatform } from "@/lib/capacitor/platform";
import {
  isNativeAppleConfigured,
  isNativeGoogleConfigured,
  nativeAppleSignIn,
  nativeGoogleSignIn,
} from "@/lib/auth/native-social";
import {
  authNextCookieString,
  sessionPrefCookieString,
  type SessionPersistence,
} from "@/lib/auth/session";
import { friendlyAuthError } from "@/lib/auth/auth-errors";
import { isWebGoogleConfigured } from "@/lib/auth/google-web";
import { safeNextPath } from "@/lib/auth/next-path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * The shared sign-in flow, used by both the /sign-in page and the inline auth
 * modal (#116). On success it either runs `onSignedIn` (the modal resumes the
 * pending action in place) or navigates to `next`.
 *
 * - **Web:** email code + Google (a full-page redirect, so we stash `next` in a
 *   short-lived cookie before redirecting and the callback reads it).
 * - **Native app:** everything stays in-app (#149). Email code always; plus
 *   native Apple (iOS) and Google **sign-in sheets** (#151) - the OS-native
 *   account pickers via `signInWithIdToken`, shown only once their client IDs
 *   are configured. The web-redirect Google button is never shown on native.
 */

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

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M16.365 1.43c0 1.14-.417 2.203-1.11 3.02-.834.98-2.2 1.737-3.32 1.65-.14-1.13.42-2.32 1.06-3.06.72-.84 2.03-1.5 3.14-1.55.02.11.03.22.03.34zm3.87 15.66c-.6 1.38-.89 2-1.66 3.22-1.08 1.7-2.6 3.82-4.48 3.83-1.67.02-2.1-1.09-4.37-1.08-2.27.01-2.74 1.1-4.41 1.09-1.88-.02-3.32-1.93-4.4-3.63C-.03 18.5-.4 13.6 1.02 11.04c1-1.82 2.6-2.97 4.1-2.97 1.53 0 2.5 1.09 3.77 1.09 1.23 0 1.98-1.09 3.75-1.09 1.34 0 2.76.73 3.77 1.99-3.31 1.81-2.77 6.54.83 8.03z"
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
  const platform = useCapacitorPlatform();
  const isNative = platform !== "web";
  const isIOS = platform === "ios";
  const showNativeGoogle = isNative && isNativeGoogleConfigured();
  const showNativeApple = isIOS && isNativeAppleConfigured();
  // Web Google is gated on configuration too, so an unconfigured deployment
  // shows the email code alone rather than a button that always fails.
  const showWebGoogle = !isNative && isWebGoogleConfigured();
  // Default checked: every web member is effectively persistent today, so an
  // unchecked default would silently start signing out returning visitors who
  // never saw this box.
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
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
      setError(friendlyAuthError(error.message));
      return;
    }
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    recordPersistence(stayLoggedIn ? "persistent" : "session");
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
    finishSignIn();
  }

  /**
   * Record the lifetime choice BEFORE the call that writes the session cookie,
   * so the very first write already has the right maxAge. Web only: native
   * never writes this cookie, and the absent-value default (persistent) is
   * what keeps the WebView signed in across app restarts.
   */
  function recordPersistence(mode: SessionPersistence) {
    if (isNative) return;
    document.cookie = sessionPrefCookieString(
      mode,
      window.location.protocol === "https:",
    );
  }

  // Shared post-sign-in navigation (OTP + native social).
  function finishSignIn() {
    if (onSignedIn) {
      onSignedIn();
      router.refresh();
    } else {
      router.push(next);
      router.refresh();
    }
  }

  // Native in-app sheets (#151). No browser; the OS account picker returns a
  // token we exchange with Supabase.
  async function signInNatively(run: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await run();
      finishSignIn();
    } catch (e) {
      // A user-cancelled sheet also lands here - a quiet retry is fine.
      setError(friendlyAuthError(e instanceof Error ? e.message : null));
      setPending(false);
    }
  }

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    // Stash the destination for the callback (OAuth can't carry ?next
    // reliably). Sanitised on the way in as well as on the way out, so a bad
    // `next` prop can never round-trip into a redirect.
    document.cookie = authNextCookieString(
      safeNextPath(next),
      window.location.protocol === "https:",
    );
    // Survives the round trip to /auth/callback because it is SameSite=Lax,
    // like the cookie above.
    recordPersistence(stayLoggedIn ? "persistent" : "session");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setPending(false);
      setError(friendlyAuthError(error.message));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sign in with Apple - iOS native sheet, shown first per Apple's HIG. */}
      {showNativeApple && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => signInNatively(nativeAppleSignIn)}
          disabled={pending}
        >
          <AppleIcon />
          Continue with Apple
        </Button>
      )}

      {/* Google - native account sheet in the app; full-page redirect on web.
          The web-redirect variant is never shown on native (it would leave to a
          browser); the native sheet appears only once its client IDs exist. */}
      {showNativeGoogle ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => signInNatively(nativeGoogleSignIn)}
          disabled={pending}
        >
          <GoogleIcon />
          Continue with Google
        </Button>
      ) : (
        showWebGoogle && (
          <Button
            type="button"
            variant="secondary"
            onClick={signInWithGoogle}
            disabled={pending}
          >
            <GoogleIcon />
            Continue with Google
          </Button>
        )
      )}

      {/* The divider only earns its place when something sits above it -
          otherwise a bare "or" floats over the email form on its own. */}
      {(showWebGoogle || showNativeGoogle || showNativeApple) && (
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="font-mono text-xs text-ink-dim">or</span>
          <span className="h-px flex-1 bg-line" />
        </div>
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

      {/* Web only. The native shell has no token storage and relies entirely on
          WebView cookie persistence, so a session-only cookie would sign people
          out whenever the app restarts. It never writes the preference. */}
      {!isNative && (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-dim">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={stayLoggedIn}
            onChange={(e) => setStayLoggedIn(e.target.checked)}
          />
          <span>
            Stay logged in
            <span className="block text-xs text-ink-dim/70">
              Uncheck on a shared computer.
            </span>
          </span>
        </label>
      )}

      {error && <p className="text-center text-sm text-danger">{error}</p>}
    </div>
  );
}
