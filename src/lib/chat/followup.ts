import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * "Did you make it to X?" - the one question that closes the loop.
 *
 * Everything the concierge learns today comes from things a member does
 * *inside* the app: a click, a save, a dismiss. None of it knows whether the
 * answer was any good, because the only evidence of that happens in the world.
 * REVIEW.md names this the north-star signal and observes it is measured
 * nowhere.
 *
 * A `visit` is also the heaviest positive the learning loop has short of
 * completing a quest, so one honest answer here is worth many clicks.
 *
 * ## Why in-app rather than a push notification
 *
 * Push would reach further, but it needs notification permission, a scheduled
 * job, and a delivery path none of which can be exercised here - and a nudge
 * that fires wrong at 9am is worse than one that waits until someone opens the
 * app anyway. This asks the next time they arrive, which costs nothing and
 * cannot misfire.
 */

/** Long enough that the evening resolved; anything sooner is asking mid-visit. */
const MIN_AGE_HOURS = 12;

/**
 * After this the question is noise - nobody remembers a Tuesday, and a stale
 * prompt trains people to dismiss the surface without reading it.
 */
const MAX_AGE_HOURS = 72;

/** Clicks to consider. Enough to skip past ones already answered. */
const CANDIDATE_LIMIT = 10;

export interface VisitCheck {
  placeId: string;
  slug: string;
  name: string;
}

/**
 * The most recent pick they clicked, in the window, that they have not since
 * told us they visited.
 *
 * Returns null far more often than not, which is correct: this should be a
 * quiet occasional question, not a standing demand.
 */
export async function pendingVisitCheck(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<VisitCheck | null> {
  const now = Date.now();
  const notBefore = new Date(now - MAX_AGE_HOURS * 3600_000).toISOString();
  const notAfter = new Date(now - MIN_AGE_HOURS * 3600_000).toISOString();

  try {
    const { data: clicks } = await supabase
      .from("interaction_events")
      .select("place_id, created_at")
      .eq("user_id", userId)
      .eq("event_type", "chat_pick_click")
      .not("place_id", "is", null)
      .gte("created_at", notBefore)
      .lte("created_at", notAfter)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);

    const clicked = (clicks ?? [])
      .map((c) => c.place_id)
      .filter((id): id is string => Boolean(id));
    if (clicked.length === 0) return null;

    // Anything they already told us about is settled - asking again reads as
    // not listening. `visit` covers the yes; `dismiss` covers a no they gave
    // on the card itself.
    const { data: answered } = await supabase
      .from("interaction_events")
      .select("place_id")
      .eq("user_id", userId)
      .in("event_type", ["visit", "dismiss"])
      .in("place_id", clicked);

    const settled = new Set((answered ?? []).map((a) => a.place_id));
    const askAbout = clicked.find((id) => !settled.has(id));
    if (!askAbout) return null;

    const { data: place } = await supabase
      .from("places")
      .select("id, slug, name")
      .eq("id", askAbout)
      .eq("is_published", true)
      .maybeSingle();

    return place
      ? { placeId: place.id, slug: place.slug, name: place.name }
      : null;
  } catch {
    // Best effort. A missing nudge costs a signal; a thrown one costs the page.
    return null;
  }
}
