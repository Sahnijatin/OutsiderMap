import type { ModerationBand } from "./types";
import type { Posture } from "./trust";

export type PublishResolution = {
  status: "approved" | "rejected" | "pending";
  caseDecision: "auto_approved" | "auto_rejected" | "needs_review";
};

/**
 * Map a moderation band + posture to the content's publish status and the
 * case decision (pure). Rejections and clean approvals are unconditional;
 * the uncertain middle is where posture matters - an established member's
 * text publishes optimistically (case stays open for async review / pull),
 * while new/restricted content is held pending a human.
 */
export function resolvePublishStatus(
  action: ModerationBand,
  posture: Posture,
): PublishResolution {
  if (action === "auto_reject") {
    return { status: "rejected", caseDecision: "auto_rejected" };
  }
  if (action === "auto_approve") {
    return { status: "approved", caseDecision: "auto_approved" };
  }
  // needs_review
  if (posture === "optimistic") {
    return { status: "approved", caseDecision: "needs_review" };
  }
  return { status: "pending", caseDecision: "needs_review" };
}
