import Link from "next/link";
import { SignInForm } from "@/app/(auth)/sign-in/sign-in-form";

/**
 * The front door. Rendered at `/` for signed-out visitors and at `/sign-in`
 * for the `?next=` return path, so the two can never drift apart.
 *
 * It is rendered at `/`, never redirected to, and that is deliberate:
 * robots.ts disallows /sign-in, so bouncing `/` there would send every crawler
 * to a blocked URL and drop the root domain out of the index. Serving the
 * login screen at an allowed URL with real content keeps the front page
 * indexable - the same shape Instagram uses.
 */
export function SignInLanding() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="halo absolute inset-0" />
      <div className="relative flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-3 text-center">
          <span className="font-display text-xl italic">OutsiderMap</span>
          <p className="voice">Members &amp; first-timers</p>
          <p className="text-sm leading-relaxed text-ink-dim">
            Your city, your taste. Tell us the mood - we already know the rest.
          </p>
        </div>

        <SignInForm />

        <div className="flex flex-col gap-3 text-center">
          <p className="text-xs leading-relaxed text-ink-dim/70">
            New here? Same door - we&rsquo;ll set you up with a taste profile
            right after.
          </p>
          {/* The public surface stays one tap away, so the gate reads as a
              door rather than a wall. */}
          <Link
            href="/map"
            className="text-sm text-ink-dim underline-offset-4 hover:text-ink hover:underline"
          >
            Look around first
          </Link>
        </div>
      </div>
    </main>
  );
}
