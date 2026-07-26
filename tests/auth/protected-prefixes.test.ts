import { describe, expect, it } from "vitest";
import { PROTECTED_PREFIXES } from "@/proxy";

/**
 * Pins the auth wall to the real route tree. PROTECTED_PREFIXES had drifted
 * (member surfaces missing, retired routes lingering); this test fails the
 * moment the list and the app's member surfaces disagree again.
 */

const MEMBER_SURFACES = [
  "/chat",
  "/quests",
  "/setup",
  "/profile",
  "/events",
  "/feed",
  "/activity",
  "/compose",
  "/market-run",
  "/welcome",
  "/card",
  "/admin",
];

const RETIRED = ["/onboarding", "/submit", "/reels", "/join", "/thank-you"];

describe("PROTECTED_PREFIXES", () => {
  it("covers every member surface", () => {
    for (const prefix of MEMBER_SURFACES) {
      expect(PROTECTED_PREFIXES, `${prefix} must be protected`).toContain(
        prefix,
      );
    }
  });

  it("contains no retired routes", () => {
    for (const prefix of RETIRED) {
      expect(PROTECTED_PREFIXES, `${prefix} is retired`).not.toContain(prefix);
    }
  });

  it("contains only well-formed root prefixes", () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect(prefix).toMatch(/^\/[a-z-]+$/);
    }
    expect(new Set(PROTECTED_PREFIXES).size).toBe(PROTECTED_PREFIXES.length);
  });
});
