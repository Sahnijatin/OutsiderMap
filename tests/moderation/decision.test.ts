import { describe, expect, it } from "vitest";
import {
  bandToCaseDecision,
  decide,
  mergeDecisions,
} from "@/lib/moderation/decision";

describe("decide", () => {
  it("auto-approves clearly safe / empty scores", () => {
    expect(decide({}).action).toBe("auto_approve");
    expect(decide({ hate: 0.05, spam: 0.1 }).action).toBe("auto_approve");
  });

  it("auto-rejects clearly violating scores", () => {
    const d = decide({ hate: 0.92 });
    expect(d.action).toBe("auto_reject");
    expect(d.categories).toContain("hate");
    expect(d.severity).toBeGreaterThan(60);
  });

  it("sends the uncertain middle band to human review", () => {
    const d = decide({ harassment: 0.5 });
    expect(d.action).toBe("needs_review");
    expect(d.confidence).toBeLessThan(0.6);
  });

  it("hard-blocks safety-critical categories on even a low score", () => {
    const d = decide({ csam: 0.35 });
    expect(d.action).toBe("auto_reject");
    expect(d.severity).toBe(100);
    expect(d.confidence).toBe(1);
  });

  it("does not treat a non-critical category the same at a low score", () => {
    expect(decide({ sexual: 0.35 }).action).toBe("needs_review");
    expect(decide({ sexual_minors: 0.35 }).action).toBe("auto_reject");
  });
});

describe("mergeDecisions", () => {
  it("lets the most severe pass win and unions categories", () => {
    const merged = mergeDecisions([
      { action: "auto_approve", categories: [], confidence: 1, severity: 0 },
      { action: "needs_review", categories: ["spam"], confidence: 0.4, severity: 30 },
      { action: "auto_reject", categories: ["hate"], confidence: 0.9, severity: 90 },
    ]);
    expect(merged.action).toBe("auto_reject");
    expect(merged.categories).toEqual(expect.arrayContaining(["spam", "hate"]));
    expect(merged.severity).toBe(90);
  });

  it("approves an empty set", () => {
    expect(mergeDecisions([]).action).toBe("auto_approve");
  });
});

describe("bandToCaseDecision", () => {
  it("maps bands to the moderation_cases decision values", () => {
    expect(bandToCaseDecision("auto_approve")).toBe("auto_approved");
    expect(bandToCaseDecision("auto_reject")).toBe("auto_rejected");
    expect(bandToCaseDecision("needs_review")).toBe("needs_review");
  });
});
