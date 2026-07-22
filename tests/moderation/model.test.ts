import { describe, expect, it } from "vitest";
import {
  canPost,
  caseIsOpen,
  enforcementState,
  isContentPublic,
  queueRank,
  type TrustState,
} from "@/lib/moderation/model";

const NOW = Date.parse("2026-07-22T12:00:00.000Z");

describe("caseIsOpen", () => {
  it("is open for needs_review and escalated, closed once decided", () => {
    expect(caseIsOpen("needs_review")).toBe(true);
    expect(caseIsOpen("escalated")).toBe(true);
    expect(caseIsOpen("approved")).toBe(false);
    expect(caseIsOpen("removed")).toBe(false);
    expect(caseIsOpen("auto_approved")).toBe(false);
    expect(caseIsOpen("auto_rejected")).toBe(false);
  });
});

describe("isContentPublic", () => {
  it("allows only auto_approved / approved to be public", () => {
    expect(isContentPublic("auto_approved")).toBe(true);
    expect(isContentPublic("approved")).toBe(true);
    expect(isContentPublic("needs_review")).toBe(false);
    expect(isContentPublic("escalated")).toBe(false);
    expect(isContentPublic("auto_rejected")).toBe(false);
    expect(isContentPublic("removed")).toBe(false);
  });
});

describe("queueRank", () => {
  it("puts open cases before resolved, higher severity first, oldest first", () => {
    const cases = [
      { id: "resolved", decision: "approved" as const, severity: 9, created_at: "2026-07-22T01:00:00Z" },
      { id: "low", decision: "needs_review" as const, severity: 1, created_at: "2026-07-22T02:00:00Z" },
      { id: "high-new", decision: "needs_review" as const, severity: 5, created_at: "2026-07-22T05:00:00Z" },
      { id: "high-old", decision: "escalated" as const, severity: 5, created_at: "2026-07-22T03:00:00Z" },
    ];
    const order = [...cases]
      .sort((a, b) => {
        const ra = queueRank(a);
        const rb = queueRank(b);
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
      })
      .map((c) => c.id);
    expect(order).toEqual(["high-old", "high-new", "low", "resolved"]);
  });
});

describe("enforcementState / canPost", () => {
  const base: TrustState = { tier: "member", muted_until: null, banned_at: null };

  it("is active with no enforcement", () => {
    expect(enforcementState(base, NOW)).toBe("active");
    expect(canPost(base, NOW)).toBe(true);
  });

  it("is banned when banned_at is set (overrides mute)", () => {
    const t: TrustState = { ...base, banned_at: "2026-07-01T00:00:00Z", muted_until: "2030-01-01T00:00:00Z" };
    expect(enforcementState(t, NOW)).toBe("banned");
    expect(canPost(t, NOW)).toBe(false);
  });

  it("is muted while muted_until is in the future, active once it passes", () => {
    expect(enforcementState({ ...base, muted_until: "2026-07-22T18:00:00Z" }, NOW)).toBe("muted");
    expect(enforcementState({ ...base, muted_until: "2026-07-22T06:00:00Z" }, NOW)).toBe("active");
  });
});
