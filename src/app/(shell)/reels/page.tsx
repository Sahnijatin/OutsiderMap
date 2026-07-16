import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { ReelsFeed } from "./feed";

export const metadata: Metadata = { title: "Reels" };

/** Full-bleed vertical feed of approved reels for the member's city. */
export default async function ReelsPage() {
  await requireOnboarded();
  return (
    <main className="fixed inset-x-0 top-0 bottom-[var(--tab-clearance)] bg-night">
      <ReelsFeed />
    </main>
  );
}
