import { z } from "zod";

/** Structured read of a free-text "right now" ask. */
export const QueryIntentSchema = z.object({
  mood: z
    .string()
    .nullable()
    .describe("Emotional state if stated or strongly implied, else null"),
  craving: z
    .string()
    .nullable()
    .describe("Specific food/drink/activity wanted, else null"),
  energy: z
    .enum(["low", "medium", "high"])
    .nullable()
    .describe("How much the person has left in the tank"),
  budget_max: z
    .number()
    .int()
    .min(1)
    .max(4)
    .nullable()
    .describe("Price ceiling 1-4 if implied ('broke', 'fancy'), else null"),
  area: z
    .string()
    .nullable()
    .describe(
      "Delhi neighbourhood if mentioned (e.g. 'Greater Kailash' for GK), else null",
    ),
  company: z
    .enum(["alone", "date", "small-group", "big-group"])
    .nullable()
    .describe("Who they're with, if stated"),
  wants: z
    .array(z.string())
    .describe("Qualities asked for: 'quiet', 'greasy', 'open-late'…"),
  avoid: z
    .array(z.string())
    .describe("Explicit no-gos: 'no crowd', 'not another cafe'…"),
});

export type QueryIntent = z.infer<typeof QueryIntentSchema>;

/** What the LLM reranker returns: ordered picks with short reasons. */
export const RerankSchema = z.object({
  picks: z
    .array(
      z.object({
        slug: z.string().describe("slug of the chosen place, verbatim"),
        reason: z
          .string()
          .describe(
            "One specific sentence on why this place, for this person, right now",
          ),
      }),
    )
    .min(1)
    .max(3)
    .describe("Best first. Exactly 3 unless fewer candidates exist."),
});

export type Rerank = z.infer<typeof RerankSchema>;
