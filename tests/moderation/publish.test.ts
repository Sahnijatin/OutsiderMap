import { describe, expect, it } from "vitest";
import { resolvePublishStatus } from "@/lib/moderation/publish";

describe("resolvePublishStatus", () => {
  it("rejects a hard block regardless of posture", () => {
    expect(resolvePublishStatus("auto_reject", "optimistic")).toEqual({
      status: "rejected",
      caseDecision: "auto_rejected",
    });
  });

  it("approves a clean pass regardless of posture", () => {
    expect(resolvePublishStatus("auto_approve", "hold").status).toBe("approved");
  });

  it("publishes uncertain content optimistically for established members, case open", () => {
    expect(resolvePublishStatus("needs_review", "optimistic")).toEqual({
      status: "approved",
      caseDecision: "needs_review",
    });
  });

  it("holds uncertain content for new users and all media", () => {
    expect(resolvePublishStatus("needs_review", "hold").status).toBe("pending");
    expect(resolvePublishStatus("needs_review", "pre_screen").status).toBe("pending");
  });
});
