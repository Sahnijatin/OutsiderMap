import type { Metadata } from "next";
import Link from "next/link";
import { ThankYou } from "./thank-you";

export const metadata: Metadata = {
  title: "You're on the list",
  robots: { index: false },
};

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; again?: string }>;
}) {
  const sp = await searchParams;
  const code = (sp.ref ?? "").trim().toUpperCase().slice(0, 24) || null;
  const again = sp.again === "1";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const shareUrl = code ? `${appUrl}/join?ref=${code}` : `${appUrl}/join`;

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="halo pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 opacity-70"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="font-display text-lg italic">
            OutsiderMap
          </Link>
          <span className="voice hidden sm:block">Invite only · Delhi first</span>
        </header>
        <ThankYou code={code} shareUrl={shareUrl} again={again} />
      </div>
    </main>
  );
}
