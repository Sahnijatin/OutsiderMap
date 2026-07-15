"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Step = "email" | "code";

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

function SignInFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/map";
  const urlError = searchParams.get("error");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    urlError ? "That sign-in link didn’t work. Try again here." : null,
  );

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
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
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setPending(false);
    if (error) {
      setError("That code didn’t match. Check the email and try again.");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // No query string on the redirect: Supabase matches redirectTo against
        // the allow-listed Redirect URLs, and a trailing ?next=... makes that
        // match unreliable (it then falls back to the Site URL root). The
        // callback defaults to /map, which is where post-login should land.
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setPending(false);
      setError(error.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
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

export function SignInForm() {
  return (
    <Suspense>
      <SignInFormInner />
    </Suspense>
  );
}
