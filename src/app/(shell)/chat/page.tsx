import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { ChatThread } from "./thread";

export const metadata: Metadata = { title: "Chat" };

/**
 * The concierge: a conversation that narrows down to 2-3 precise places.
 * Threads persist server-side; the newest one restores on load.
 */
export default async function ChatPage() {
  const profile = await requireOnboarded();
  return (
    <main className="mx-auto flex h-dvh max-w-lg flex-col pb-16">
      <ChatThread displayName={profile.display_name} />
    </main>
  );
}
