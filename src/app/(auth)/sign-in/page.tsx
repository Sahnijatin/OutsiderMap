import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="halo absolute inset-0" />
      <div className="relative flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-3 text-center">
          <Link href="/" className="font-display text-xl italic">
            OutsiderMap
          </Link>
          <p className="voice">Members &amp; first-timers</p>
        </div>
        <SignInForm />
        <p className="text-center text-xs leading-relaxed text-ink-dim/70">
          New here? Same door - we&rsquo;ll set you up with a taste profile
          right after.
        </p>
      </div>
    </main>
  );
}
