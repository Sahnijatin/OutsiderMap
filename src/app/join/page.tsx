import type { Metadata } from "next";
import Link from "next/link";
import { JoinFlow } from "./join-flow";

export const metadata: Metadata = {
  title: "Become an Outsider — join the waitlist",
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
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const defaultReferral = (ref ?? "").trim().toUpperCase().slice(0, 24);

  return (
    <main className="relative min-h-dvh overflow-hidden">
      {/* Sodium-lamp halo — the recurring brand lighting motif. */}
      <div
        aria-hidden
        className="halo pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 opacity-70"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="font-display text-lg italic">
            OutsiderMap
          </Link>
          <span className="voice hidden sm:block">Delhi · invite only</span>
        </header>
        <JoinFlow defaultReferral={defaultReferral} />
      </div>
    </main>
  );
}
