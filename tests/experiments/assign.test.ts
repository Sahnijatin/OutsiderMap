import { describe, expect, it } from "vitest";
import { assignVariant, hashToUnit } from "@/lib/experiments/assign";

describe("hashToUnit", () => {
  it("is deterministic and bounded to [0, 1)", () => {
    for (const s of ["", "a", "one_answer_vs_list:u1", "🙂"]) {
      const v = hashToUnit(s);
      expect(v).toBe(hashToUnit(s));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("separates similar inputs", () => {
    expect(hashToUnit("exp:user-1")).not.toBe(hashToUnit("exp:user-2"));
  });
});

describe("assignVariant", () => {
  const variants = ["list", "one"];

  it("is stable for the same (experiment, user)", () => {
    const a = assignVariant("one_answer_vs_list", "user-123", variants);
    const b = assignVariant("one_answer_vs_list", "user-123", variants);
    expect(a).toBe(b);
    expect(variants).toContain(a);
  });

  it("assigns only declared variants", () => {
    for (let i = 0; i < 200; i++) {
      expect(variants).toContain(
        assignVariant("one_answer_vs_list", `u${i}`, variants),
      );
    }
  });

  it("splits roughly evenly across two variants", () => {
    let one = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      if (assignVariant("one_answer_vs_list", `user-${i}`, variants) === "one") {
        one++;
      }
    }
    const share = one / n;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  it("changing the experiment key reshuffles assignment", () => {
    // Not everyone flips, but the two keys must not be identical for all users.
    const differ = Array.from({ length: 100 }, (_, i) => `u${i}`).some(
      (u) =>
        assignVariant("exp_a", u, variants) !==
        assignVariant("exp_b", u, variants),
    );
    expect(differ).toBe(true);
  });

  it("throws on an empty variant list rather than serving undefined", () => {
    expect(() => assignVariant("x", "u", [])).toThrow();
  });
});
