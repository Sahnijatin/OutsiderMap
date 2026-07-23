import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="halo absolute inset-0" />
      <p className="voice relative">404</p>
      <h1 className="relative font-display text-4xl">
        This corner doesn&rsquo;t exist.
      </h1>
      <p className="relative max-w-sm text-sm text-ink-dim">
        Or it does, and it&rsquo;s so underground even we can&rsquo;t find it.
      </p>
      <Link
        href="/map"
        className="relative text-sm text-accent transition-colors hover:underline"
      >
        Back to the map →
      </Link>
    </main>
  );
}
