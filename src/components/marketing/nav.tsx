import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export function MarketingNav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line/60 bg-night/70 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="font-display text-lg italic">
          OutsiderMap
        </Link>
        <div className="flex items-center gap-2 sm:gap-6">
          <Link
            href="/#how"
            className="hidden text-sm text-ink-dim transition-colors hover:text-ink sm:block"
          >
            How it works
          </Link>
          {/* Sign in & Pricing are intentionally hidden pre-launch — the
              routes still work by direct URL while we build behind the scenes. */}
          <ButtonLink href="/sign-in" variant="primary" size="sm">
            Sign up
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}
