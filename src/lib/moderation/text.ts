import "server-only";
import { z } from "zod";
import { getAI } from "@/lib/ai";
import { decide, mergeDecisions, SAFETY_CRITICAL } from "./decision";
import { heuristicScores } from "./heuristics";
import { MODERATION_CATEGORIES, type CategoryScores, type TextModerator } from "./types";

/**
 * Default text moderator: cheap heuristics as a fast gate, then the existing
 * LLM classifier for nuance, context, and Hinglish/code-switching the keyword
 * layer misses. Degrades to heuristics-only if the LLM call fails — a flaky
 * model must never wave content through or hard-fail the write.
 */

const scoreField = z.number().min(0).max(1).default(0);
const ClassifierSchema = z.object(
  Object.fromEntries(MODERATION_CATEGORIES.map((c) => [c, scoreField])) as Record<
    (typeof MODERATION_CATEGORIES)[number],
    typeof scoreField
  >,
);

const SYSTEM_PROMPT = [
  "You are a content-safety classifier for a place-discovery social app used in India.",
  "Score the user text from 0 to 1 for each category. 0 = clearly absent, 1 = clearly present.",
  "Understand Hinglish and code-switching; judge intent and context, not just keywords.",
  "Be especially careful with the safety-critical categories:",
  SAFETY_CRITICAL.join(", ") + ".",
  "Return only the scores.",
].join(" ");

async function classify(text: string): Promise<CategoryScores> {
  const scores = await getAI().extract({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    schema: ClassifierSchema,
    schemaName: "moderation_scores",
  });
  return scores as CategoryScores;
}

export function createTextModerator(): TextModerator {
  return {
    name: "heuristics+llm",
    async moderateText(text) {
      const heuristic = decide(heuristicScores(text));
      // Fast exit: a heuristic hard-block needs no LLM spend.
      if (heuristic.action === "auto_reject") return heuristic;

      try {
        const llm = decide(await classify(text));
        return mergeDecisions([heuristic, llm]);
      } catch (err) {
        console.error("text moderation: LLM classify failed, heuristics only", err);
        return heuristic;
      }
    },
  };
}
