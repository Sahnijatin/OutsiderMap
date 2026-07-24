import "server-only";
import type { ImageModerator, ModerationDecision } from "./types";

/**
 * Image/video moderation behind a swappable ImageModerator. The concrete
 * provider (Hive / AWS Rekognition / Google Vision - see #91) is chosen at
 * build. Until one is configured the default is deliberately conservative:
 * every media item returns `needs_review`, so nothing auto-publishes and a
 * human clears it. That preserves the "no unscreened media goes public"
 * invariant even before a vendor is wired.
 */

const HOLD: ModerationDecision = {
  action: "needs_review",
  categories: [],
  confidence: 0,
  severity: 10,
  reason: "no image provider configured - held for review",
};

export function createHoldImageModerator(): ImageModerator {
  return {
    name: "hold",
    async moderateImage() {
      return HOLD;
    },
  };
}

/** The active image moderator. Swap the factory when a provider is onboarded. */
export function createImageModerator(): ImageModerator {
  return createHoldImageModerator();
}
