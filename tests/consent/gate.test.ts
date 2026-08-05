import { describe, expect, it } from "vitest";
import { evaluateGate, type GateProfile } from "@/lib/consent/gate";
import { PRIVACY_POLICY_VERSION } from "@/lib/consent/policy";

/**
 * The front door. requireOnboarded() and the /setup page both read from this
 * one function, so a disagreement between them is impossible - which matters
 * because a disagreement between a redirect and the page it redirects to is a
 * loop, and a loop at the sign-in gate is invisible to everyone except the
 * people locked out by it.
 */

const NOW = Date.parse("2026-08-05T10:00:00Z");

const settled: GateProfile = {
  username: "member",
  onboarding_completed_at: "2026-01-01T00:00:00Z",
  age_verified_at: "2026-01-01T00:00:00Z",
  blocked_at: null,
  date_of_birth: "1990-01-01",
  policy_version_accepted: PRIVACY_POLICY_VERSION,
};

const profile = (over: Partial<GateProfile> = {}): GateProfile => ({
  ...settled,
  ...over,
});

describe("evaluateGate", () => {
  it("lets a fully set-up member through", () => {
    expect(evaluateGate(settled, NOW)).toBe("ok");
  });

  it("blocks before it asks anything else", () => {
    // Nothing is worth asking someone we have already refused.
    const blocked = profile({
      blocked_at: "2026-08-01T00:00:00Z",
      username: null,
      age_verified_at: null,
      policy_version_accepted: null,
    });
    expect(evaluateGate(blocked, NOW)).toBe("blocked");
  });

  it("blocks a stored date of birth that no longer clears the gate", () => {
    // Belt and braces: reaching this means something wrote the column without
    // going through set_date_of_birth().
    const tampered = profile({ date_of_birth: "2015-01-01" });
    expect(evaluateGate(tampered, NOW)).toBe("blocked");
  });

  it("asks for age before anything that would profile them", () => {
    const fresh = profile({
      age_verified_at: null,
      date_of_birth: null,
      username: null,
      onboarding_completed_at: null,
      policy_version_accepted: null,
    });
    expect(evaluateGate(fresh, NOW)).toBe("age");
  });

  it("asks for a username once the age is settled", () => {
    expect(
      evaluateGate(
        profile({ username: null, onboarding_completed_at: null }),
        NOW,
      ),
    ).toBe("username");
  });

  it("sends a named member to the quiz", () => {
    expect(evaluateGate(profile({ onboarding_completed_at: null }), NOW)).toBe(
      "quiz",
    );
  });

  it("asks a legacy member to re-consent", () => {
    // Everyone who existed before migration 57 carries 'legacy', which is not
    // evidence of consent to anything.
    expect(evaluateGate(profile({ policy_version_accepted: "legacy" }), NOW)).toBe(
      "reconsent",
    );
  });

  it("asks a member who never accepted anything", () => {
    expect(
      evaluateGate(profile({ policy_version_accepted: null }), NOW),
    ).toBe("reconsent");
  });

  it("puts re-consent last, so a half-set-up account finishes setup first", () => {
    // A member mid-signup should not be handed a policy diff.
    const midSignup = profile({
      username: null,
      onboarding_completed_at: null,
      policy_version_accepted: "legacy",
    });
    expect(evaluateGate(midSignup, NOW)).toBe("username");
  });

  it("does not block an adult whose birthday has just passed", () => {
    expect(
      evaluateGate(profile({ date_of_birth: "2008-08-05" }), NOW),
    ).toBe("ok");
  });

  it("blocks someone one day short of 18", () => {
    expect(
      evaluateGate(profile({ date_of_birth: "2008-08-06" }), NOW),
    ).toBe("blocked");
  });
});
