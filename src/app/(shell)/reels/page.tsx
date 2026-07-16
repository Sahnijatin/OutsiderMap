import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { ReelsFeed } from "./feed";

export const metadata: Metadata = { title: "Reels" };

/** Full-bleed vertical feed of approved reels for the member's city. */
export default async function ReelsPage() {
  await requireOnboarded();
  return (
    <main className="fixed left-[var(--rail-w)] right-0 top-0 bottom-[var(--tab-clearance)] bg-night">
      {/* On desktop the feed stays phone-ratio, staged center on night black. */}
      <div className="relative h-full lg:mx-auto lg:aspect-[9/16] lg:w-auto lg:max-w-full">
        <div className="halo absolute -inset-16 hidden lg:block" />
        <div className="relative h-full lg:overflow-hidden lg:rounded-2xl lg:border lg:border-line/40">
          <ReelsFeed />
        </div>
      </div>
    </main>
  );
}
