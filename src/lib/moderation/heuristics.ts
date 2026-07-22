import type { CategoryScores } from "./types";

/**
 * Cheap, pure text heuristics — the fast gate before the LLM classifier.
 * These catch obvious spam (link flooding, repetition, known spam phrases);
 * nuanced categories (hate, harassment, threats, Hinglish subtext) are the
 * LLM's job. Abusive-term lists are configuration, never hardcoded here.
 */

export function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+/gi) ?? [];
}

/** 0 (all unique) … 1 (one token repeated). Short texts return 0. */
export function repetitionRatio(text: string): number {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return 0;
  return 1 - new Set(tokens).size / tokens.length;
}

/** Default spam phrases; callers may pass their own (configured) list. */
export const DEFAULT_SPAM_PHRASES = [
  "click here to win",
  "free crypto",
  "make money fast",
  "work from home",
  "limited time offer",
];

/** Pure heuristic scores. Only ever raises `spam` — never a safety category. */
export function heuristicScores(
  text: string,
  spamPhrases: readonly string[] = DEFAULT_SPAM_PHRASES,
): CategoryScores {
  const trimmed = text.trim();
  if (!trimmed) return {};

  const urls = extractUrls(trimmed);
  const linkDensity = urls.join("").length / trimmed.length;
  const rep = repetitionRatio(trimmed);
  const lowered = trimmed.toLowerCase();

  let spam = 0;
  if (urls.length >= 3) spam = Math.max(spam, 0.85);
  else if (urls.length >= 1 && linkDensity > 0.5) spam = Math.max(spam, 0.85);
  if (rep >= 0.6) spam = Math.max(spam, 0.82);
  if (spamPhrases.some((p) => lowered.includes(p))) spam = Math.max(spam, 0.8);

  return spam > 0 ? { spam } : {};
}
