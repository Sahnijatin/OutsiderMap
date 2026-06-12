import "server-only";
import { z } from "zod";
import { getAI } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { TasteDimensionsSchema } from "@/lib/taste/profile";

/**
 * Weekend Planner generation (premium). Candidates come from taste-embedding
 * retrieval; the LLM composes the Fri–Sun arc and must pick only from them.
 */

export const PLAN_DAYS = ["fri", "sat", "sun"] as const;
export type PlanDay = (typeof PLAN_DAYS)[number];

const GeneratedPlanSchema = z.object({
  title: z
    .string()
    .describe(
      "A short evocative name for this weekend, e.g. 'The Slow Burn Weekend'",
    ),
  days: z
    .array(
      z.object({
        day: z.enum(PLAN_DAYS),
        items: z
          .array(
            z.object({
              slot: z
                .string()
                .describe("e.g. 'late brunch', 'golden hour', 'dinner', 'after midnight'"),
              time: z.string().describe("Suggested start, HH:MM 24h IST"),
              place_slug: z
                .string()
                .describe("slug of a candidate place, verbatim"),
              note: z
                .string()
                .describe(
                  "One sentence: what to do there and why it fits this person, this weekend",
                ),
            }),
          )
          .min(1)
          .max(3),
      }),
    )
    .length(3)
    .describe("Exactly fri, sat, sun in order, 2-3 items each ideally"),
});

/** The shape stored in weekend_plans.items (flat, ordered). */
export const StoredItemSchema = z.object({
  day: z.enum(PLAN_DAYS),
  slot: z.string(),
  time: z.string(),
  place_slug: z.string(),
  place_name: z.string(),
  area: z.string().nullable(),
  note: z.string(),
});
export type StoredPlanItem = z.infer<typeof StoredItemSchema>;
export const StoredItemsSchema = z.array(StoredItemSchema);

const PLAN_SYSTEM = `You are OutsiderMap's weekend planner for Delhi. Compose a Friday-evening-to-Sunday-night arc for one specific person from the candidate places provided — never invent a place, only use candidate slugs verbatim. Think in energy: Friday unwinds the week, Saturday is the long day, Sunday repairs. Respect their budget and stated constraints, vary areas sensibly (no criss-crossing the city twice in a day), match places to realistic times (no breakfast at a bar), and write notes that are specific to this person — name the dish, the corner, the hour. No marketing language.`;

const StoredQuizSchema = z.object({
  dimensions: TasteDimensionsSchema.optional(),
});

export type WeekendConstraints = {
  weekendStart: string; // the Friday, YYYY-MM-DD
  brief?: string;
  budgetMax?: number;
};

export async function generateWeekendPlan(
  userId: string,
  constraints: WeekendConstraints,
) {
  const supabase = await createClient();

  const { data: taste } = await supabase
    .from("taste_profiles")
    .select("taste_summary, embedding, quiz_answers")
    .eq("user_id", userId)
    .maybeSingle();
  if (!taste?.embedding) {
    throw new Error(
      "Your taste profile isn't ready yet — finish it from your profile page.",
    );
  }

  const { data: candidates, error } = await supabase.rpc("match_places", {
    query_embedding: taste.embedding,
    match_count: 40,
    filter_city: "delhi",
    filter_area: null,
    max_price_level: constraints.budgetMax ?? null,
  });
  if (error) throw new Error(`match_places failed: ${error.message}`);
  if (!candidates || candidates.length < 6) {
    throw new Error("Not enough places in the catalog to plan a weekend yet.");
  }

  const dimensions = StoredQuizSchema.safeParse(taste.quiz_answers);

  const generated = await getAI().extract({
    schema: GeneratedPlanSchema,
    schemaName: "weekend_plan",
    messages: [
      { role: "system", content: PLAN_SYSTEM },
      {
        role: "user",
        content: [
          `Weekend of ${constraints.weekendStart} (that Friday through Sunday).`,
          taste.taste_summary && `Taste profile: ${taste.taste_summary}`,
          dimensions.success && dimensions.data.dimensions
            ? `Anchors: ${dimensions.data.dimensions.anchors.join(" | ")}`
            : null,
          constraints.brief && `Their brief for this weekend: "${constraints.brief}"`,
          constraints.budgetMax &&
            `Budget ceiling: price level ${constraints.budgetMax} of 4.`,
          `Candidates:\n${JSON.stringify(
            candidates.map((c) => ({
              slug: c.slug,
              name: c.name,
              area: c.area,
              category: c.category,
              price: c.price_level,
              vibes: c.vibe_tags,
              about: c.description,
              editor_note: c.editor_note,
            })),
          )}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    maxTokens: 3000,
  });

  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const items: StoredPlanItem[] = [];
  for (const day of generated.days) {
    for (const item of day.items) {
      const place = bySlug.get(item.place_slug);
      if (!place) continue; // hallucinated slug — drop the item
      items.push({
        day: day.day,
        slot: item.slot,
        time: item.time,
        place_slug: place.slug,
        place_name: place.name,
        area: place.area,
        note: item.note,
      });
    }
  }
  if (items.length === 0) {
    throw new Error("Plan generation produced nothing usable — try again.");
  }

  const { data: plan, error: insertError } = await supabase
    .from("weekend_plans")
    .insert({
      user_id: userId,
      title: generated.title,
      weekend_start: constraints.weekendStart,
      items,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  return { planId: plan.id, items };
}

/** The upcoming Friday (today if Friday), in IST. */
export function nextFriday(from = new Date()) {
  const ist = new Date(
    from.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  );
  const daysUntilFriday = (5 - ist.getDay() + 7) % 7;
  ist.setDate(ist.getDate() + daysUntilFriday);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
