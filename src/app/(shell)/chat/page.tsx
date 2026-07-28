import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatShell } from "./chat-shell";

export const metadata: Metadata = { title: "Chat" };

/** Cheap guard before the slug reaches a query. */
const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * The place an ask started from, resolved server-side.
 *
 * Resolved here rather than trusted from the URL for two reasons: it checks the
 * slug is a real, published, non-chain place before anything downstream treats
 * it as context, and it gets the name so the empty state can say what this
 * conversation is about instead of showing a slug.
 */
async function resolveViewing(slug: string | undefined) {
  if (!slug || !SLUG.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("slug, name")
    .eq("slug", slug)
    .eq("is_published", true)
    .eq("is_chain", false)
    .maybeSingle();
  return data ? { slug: data.slug, name: data.name } : null;
}

/**
 * The concierge: a conversation that narrows down to 2-3 precise places.
 * Every visit starts a fresh ask; past threads live in the history list
 * (persistent sidebar on desktop, slide-over sheet on phones).
 *
 * `?place=` arrives from the map's place sheet, so "is this any good?" can be
 * asked about somewhere without having to name it again.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const [profile, { place }] = await Promise.all([
    requireOnboarded(),
    searchParams,
  ]);
  return (
    <ChatShell
      displayName={profile.display_name}
      viewing={await resolveViewing(place)}
    />
  );
}
