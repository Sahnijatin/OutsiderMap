import type { Metadata } from "next";
import Link from "next/link";
import { JoinFlow } from "./join-flow";

export const metadata: Metadata = {
  title: "Become an Outsider - join the waitlist",
  description:
    "The first 100 outsiders get early access to every spot, every drop, and every area before anyone else. Apply to the OutsiderMap waitlist.",
  openGraph: {
    title: "Become an Outsider",
    description:
      "We're choosing 100 outsiders ourselves. Apply for early access to OutsiderMap.",
  },
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined): string | null =>
    typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? null) : null;

  const defaultReferral = (first(sp.ref) ?? "").trim().toUpperCase().slice(0, 24);
  const utm = {
    source: first(sp.utm_source),
    medium: first(sp.utm_medium),
    campaign: first(sp.utm_campaign),
    term: first(sp.utm_term),
    content: first(sp.utm_content),
  };
  // Public key - read directly from process.env (not serverEnv) so the page
  // renders without full env validation. Null disables the widget.
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;

  return (
    <main className="relative min-h-dvh overflow-hidden">
      {/* Sodium-lamp halo - the recurring brand lighting motif. */}
      <div
        aria-hidden
        className="halo pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 opacity-70"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/map" className="font-display text-lg italic">
            OutsiderMap
          </Link>
          <span className="voice hidden sm:block">Invite only · Delhi first</span>
        </header>
        <JoinFlow
          defaultReferral={defaultReferral}
          turnstileSiteKey={turnstileSiteKey}
          googleMapsApiKey={googleMapsApiKey}
          utm={utm}
        />
      </div>
    </main>
  );
}
