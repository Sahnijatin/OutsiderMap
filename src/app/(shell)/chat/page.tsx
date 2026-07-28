import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pendingVisitCheck } from "@/lib/chat/followup";
import { chatOpeners } from "@/lib/chat/openers";
import { loadPersona } from "@/lib/chat/persona";
import { nowInIST } from "@/lib/places/hours";
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
  const supabase = await createClient();
  const [viewing, visitCheck, openers] = await Promise.all([
    resolveViewing(place),
    pendingVisitCheck(supabase, profile.id),
    resolveOpeners(supabase, profile),
  ]);
  return (
    <ChatShell
      displayName={profile.display_name}
      viewing={viewing}
      visitCheck={visitCheck}
      openers={openers}
    />
  );
}

/**
 * The suggestion chips, built from the member's own vocabulary.
 *
 * Runs on the server because the hour has to be IST regardless of the device
 * clock, and because rendering the same strings on both sides is the only way
 * a chip does not flicker on hydration.
 *
 * Reuses `loadPersona` rather than re-reading the profile by hand: it already
 * carries the consent gate and the defensive parsing of two columns that have
 * survived several shape changes, and a second implementation of either would
 * be a second thing to keep right.
 */
async function resolveOpeners(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: { id: string; personalization_enabled: boolean | null },
) {
  const { data: taste } = await supabase
    .from("taste_profiles")
    .select("quiz_answers, learned_signals")
    .eq("user_id", profile.id)
    .maybeSingle();

  const persona = await loadPersona(
    supabase,
    profile.id,
    profile.personalization_enabled !== false,
    {
      displayName: null,
      quizAnswers: taste?.quiz_answers ?? null,
      learnedSignals: taste?.learned_signals ?? null,
    },
  );

  // Null persona means personalization is off, and the generic chips are the
  // honest answer: an opted-out member should see a chat that knows nothing
  // about them, not a slightly less specific version of one that does.
  return chatOpeners(
    persona && {
      areas: persona.areas,
      cuisines: persona.cuisines,
      savedRecently: persona.savedRecently,
      posture: persona.posture,
      hourIST: Math.floor(nowInIST().minutes / 60),
    },
  );
}
