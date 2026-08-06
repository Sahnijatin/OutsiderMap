import { describe, expect, it } from "vitest";
import {
  PRIVACY_POLICY_VERSION,
  latestMaterialVersion,
  needsReconsent,
} from "@/lib/consent/policy";

/**
 * The re-consent trigger. Two failure modes matter and pull in opposite
 * directions: never asking again after a material change (unlawful), and
 * asking after every typo fix (consent fatigue, which makes the asking
 * meaningless). Both are pinned here.
 */

const MATERIAL = ["2026-08-05", "2027-01-15"] as const;

describe("latestMaterialVersion", () => {
  it("ignores material versions from the future", () => {
    expect(latestMaterialVersion("2026-09-01", MATERIAL)).toBe("2026-08-05");
  });

  it("moves once the newer one is live", () => {
    expect(latestMaterialVersion("2027-02-01", MATERIAL)).toBe("2027-01-15");
  });

  it("falls back to the current version when nothing is material yet", () => {
    expect(latestMaterialVersion("2026-01-01", MATERIAL)).toBe("2026-01-01");
  });
});

describe("needsReconsent", () => {
  it("asks a member who has never accepted", () => {
    expect(needsReconsent(null, "2026-08-05", MATERIAL)).toBe(true);
    expect(needsReconsent(undefined, "2026-08-05", MATERIAL)).toBe(true);
  });

  it("asks everyone carried over by the migration-57 backfill", () => {
    // 'legacy' is the marker written for pre-DPDP accounts. It is not evidence
    // of consent and must never be treated as any.
    expect(needsReconsent("legacy", "2026-08-05", MATERIAL)).toBe(true);
  });

  it("does not ask someone already on the current version", () => {
    expect(needsReconsent("2026-08-05", "2026-08-05", MATERIAL)).toBe(false);
  });

  it("does not ask for a cosmetic bump", () => {
    // Version moved, but the change was not listed as material.
    expect(needsReconsent("2026-08-05", "2026-09-01", MATERIAL)).toBe(false);
  });

  it("asks after a material change", () => {
    expect(needsReconsent("2026-08-05", "2027-01-15", MATERIAL)).toBe(true);
  });

  it("asks again after a second material change", () => {
    expect(needsReconsent("2026-08-05", "2027-03-01", MATERIAL)).toBe(true);
    expect(needsReconsent("2027-01-15", "2027-03-01", MATERIAL)).toBe(false);
  });

  it("fails closed on a version it does not recognise", () => {
    // A rollback, a typo, a hand-edited row: none of these are proof.
    expect(needsReconsent("banana", "2026-08-05", MATERIAL)).toBe(true);
    expect(needsReconsent("2099-01-01", "2026-08-05", MATERIAL)).toBe(true);
  });

  it("defaults to the shipped constants", () => {
    expect(needsReconsent(PRIVACY_POLICY_VERSION)).toBe(false);
    expect(needsReconsent("legacy")).toBe(true);
  });
});

describe("the shipped policy constant", () => {
  it("is an ISO date, so ordering is chronological", () => {
    expect(PRIVACY_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
