/**
 * Vendor-agnostic moderation contracts + shared result shapes. Providers
 * (OpenAI Moderation, Hive, Rekognition, PhotoDNA, …) are chosen at build
 * behind these interfaces; nothing outside src/lib/moderation/ imports a SDK.
 * Types only (no runtime), so pure consumers unit-test cleanly.
 */

/** Normalized category space; each provider maps its labels into this set. */
export const MODERATION_CATEGORIES = [
  "sexual",
  "sexual_minors",
  "hate",
  "harassment",
  "violence",
  "violence_threat",
  "self_harm",
  "self_harm_intent",
  "non_consensual_intimate",
  "csam",
  "spam",
  "illegal",
] as const;
export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

/** The banded action, mirroring moderation_cases.decision groupings. */
export type ModerationBand = "auto_approve" | "auto_reject" | "needs_review";

export type CategoryScores = Partial<Record<ModerationCategory, number>>;

export type ModerationAssessment = {
  provider: string;
  model?: string;
  scores: CategoryScores;
};

export type ModerationDecision = {
  action: ModerationBand;
  categories: ModerationCategory[];
  /** 0..1 - how confident the band is (near-1 = clearly in-band). */
  confidence: number;
  /** 0..100 - queue priority for needs_review / auto_reject. */
  severity: number;
  reason?: string;
};

/** A stored-media reference the image/CSAM scanners resolve to bytes. */
export type MediaRef = {
  bucket: string;
  path: string;
  kind: "image" | "video";
};

export interface TextModerator {
  readonly name: string;
  moderateText(text: string): Promise<ModerationDecision>;
}

export interface ImageModerator {
  readonly name: string;
  moderateImage(input: MediaRef): Promise<ModerationDecision>;
}

export type CsamMatch = { hit: boolean; source?: string };

export interface CsamScanner {
  readonly name: string;
  scan(input: MediaRef): Promise<CsamMatch>;
}
