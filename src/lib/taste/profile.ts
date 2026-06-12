import "server-only";
import { z } from "zod";
import { getAI, getEmbeddings } from "@/lib/ai";
import { answersToText, type QuizAnswers } from "@/lib/taste/quiz";

/**
 * The structured taste profile — the workhorse schema. Extracted from quiz
 * answers at onboarding, re-extracted when the quiz is retaken, and blended
 * with learned signals from interaction_events over time.
 */
export const TasteDimensionsSchema = z.object({
  adventurousness: z
    .number()
    .min(0)
    .max(1)
    .describe("0 = strict comfort-zone, 1 = actively hunts the unknown"),
  budget_band: z
    .number()
    .int()
    .min(1)
    .max(4)
    .describe("Typical spend appetite, 1 (street) to 4 (splurge)"),
  social_energy: z
    .enum(["solo", "intimate", "social", "crowd-seeking"])
    .describe("Default company size the person actually enjoys"),
  preferred_times: z
    .array(z.enum(["morning", "afternoon", "evening", "late-night", "sunrise"]))
    .min(1)
    .describe("Times of day the person's city actually happens"),
  cuisine_leanings: z
    .array(z.string())
    .describe("Cuisines/foods that recur, e.g. 'parathas', 'south indian'"),
  vibe_keywords: z
    .array(z.string())
    .min(3)
    .max(12)
    .describe(
      "Atmosphere words matched against place vibe_tags, e.g. 'hole-in-the-wall', 'heritage', 'rooftop', 'live-music'",
    ),
  areas: z.array(z.string()).describe("Delhi areas the person haunts"),
  anchors: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe(
      "Short, specific truths worth remembering, e.g. 'repairs bad days with chai, not company'",
    ),
});

export type TasteDimensions = z.infer<typeof TasteDimensionsSchema>;

const EXTRACT_SYSTEM = `You are the taste-profiling engine of OutsiderMap, a Delhi discovery product. You turn quiz answers into a precise structured profile. Be specific and opinionated; never average everything to the middle. The free-text answer about a perfect night is the strongest evidence — weight it above the multiple-choice answers when they disagree.`;

const SUMMARY_SYSTEM = `You write the "taste summary" a member sees on their OutsiderMap profile — the system's read on them. Second person, warm but unsentimental, specific to Delhi, 80–120 words, no bullet points, no flattery padding. It should feel slightly too accurate, like a friend who has watched them order for years. Mention concrete patterns (times, textures, places, moods), not personality-test abstractions.`;

export async function extractTasteDimensions(answers: QuizAnswers) {
  return getAI().extract({
    schema: TasteDimensionsSchema,
    schemaName: "taste_profile",
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      {
        role: "user",
        content: `Quiz answers:\n\n${answersToText(answers)}`,
      },
    ],
    maxTokens: 2000,
  });
}

export async function writeTasteSummary(
  answers: QuizAnswers,
  dimensions: TasteDimensions,
) {
  const { text } = await getAI().complete({
    messages: [
      { role: "system", content: SUMMARY_SYSTEM },
      {
        role: "user",
        content: `Quiz answers:\n\n${answersToText(answers)}\n\nStructured read:\n${JSON.stringify(dimensions, null, 2)}\n\nWrite the taste summary.`,
      },
    ],
    maxTokens: 600,
  });
  return text.trim();
}

/**
 * The embedding text representing this person's taste, matched against
 * place embeddings via match_places. Plain descriptive prose embeds better
 * than JSON.
 */
export function tasteEmbeddingText(dimensions: TasteDimensions) {
  return [
    `Vibe: ${dimensions.vibe_keywords.join(", ")}.`,
    `Food: ${dimensions.cuisine_leanings.join(", ") || "open to anything"}.`,
    `Goes out: ${dimensions.preferred_times.join(", ")}; ${dimensions.social_energy}.`,
    `Budget level ${dimensions.budget_band} of 4. Adventurousness ${dimensions.adventurousness.toFixed(2)}.`,
    `Areas: ${dimensions.areas.join(", ") || "all of Delhi"}.`,
    dimensions.anchors.join(" "),
  ].join("\n");
}

export async function embedTaste(dimensions: TasteDimensions) {
  const [embedding] = await getEmbeddings().embed([
    tasteEmbeddingText(dimensions),
  ]);
  return embedding;
}
