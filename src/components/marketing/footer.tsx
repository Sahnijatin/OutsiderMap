import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-line px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <span className="font-display italic">OutsiderMap</span>
          <span className="voice">Made for Delhi</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-ink-dim">
          <Link href="/#how" className="transition-colors hover:text-ink">
            How it works
          </Link>
          <Link href="/pricing" className="transition-colors hover:text-ink">
            Pricing
          </Link>
          <Link href="/sign-in" className="transition-colors hover:text-ink">
            Sign in
          </Link>
        </div>
        <p className="font-mono text-xs text-ink-dim/60">
          © 2026 OutsiderMap
        </p>
      </div>
    </footer>
  );
}
