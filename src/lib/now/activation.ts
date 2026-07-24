import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { TasteDimensionsSchema } from "@/lib/taste/profile";
import { recommend, type Recommendation } from "@/lib/now/recommend";

/**
 * The first-answer engine for the activation beat (#121). A brand-new member
 * has never typed anything, so we synthesize their "ask" from the taste
 * dimensions the quiz just extracted and run it through the same one-answer
 * pipeline (which already blends the taste embedding + reranks on the taste
 * summary). The result is one confident pick that should feel like the app
 * already gets them — no typing required.
 */

const StoredQuizSchema = z.object({
  dimensions: TasteDimensionsSchema.optional(),
});

/**
 * A taste-derived ask, in the member's own register. Pure, so it's unit-tested.
 * Falls back to a neutral evocative line when the AI dimensions are missing
 * (onboarding degraded) — recommend() still leans on the taste embedding.
 */
export function buildActivationQuery(
  dimensions:
    | { vibe_keywords?: string[]; anchors?: string[] }
    | null
    | undefined,
): string {
  const vibes = (dimensions?.vibe_keywords ?? []).slice(0, 4).filter(Boolean);
  const anchors = (dimensions?.anchors ?? []).slice(0, 2).filter(Boolean);
  if (vibes.length === 0 && anchors.length === 0) {
    return "Somewhere that feels like my kind of place right now.";
  }
  const parts = ["Somewhere that feels like me right now"];
  if (vibes.length > 0) parts.push(`- ${vibes.join(", ")}`);
  if (anchors.length > 0) parts.push(`in the spirit of ${anchors.join(" and ")}`);
  return `${parts.join(" ")}.`;
}

/**
 * Generate the member's very first answer from their taste alone. Returns the
 * single best pick, or null when the catalog/taste can't produce one (the beat
 * degrades to a plain welcome).
 */
export async function firstTasteAnswer(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Recommendation | null> {
  const { data } = await supabase
    .from("taste_profiles")
    .select("quiz_answers")
    .eq("user_id", userId)
    .maybeSingle();

  const parsed = StoredQuizSchema.safeParse(data?.quiz_answers);
  const dimensions = parsed.success ? parsed.data.dimensions : undefined;

  const result = await recommend(userId, buildActivationQuery(dimensions), supabase);
  return result.picks[0] ?? null;
}
