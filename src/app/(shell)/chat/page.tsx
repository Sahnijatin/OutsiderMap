import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { ChatShell } from "./chat-shell";

export const metadata: Metadata = { title: "Chat" };

/**
 * The concierge: a conversation that narrows down to 2-3 precise places.
 * Every visit starts a fresh ask; past threads live in the history list
 * (persistent sidebar on desktop, slide-over sheet on phones).
 */
export default async function ChatPage() {
  const profile = await requireOnboarded();
  return <ChatShell displayName={profile.display_name} />;
}
