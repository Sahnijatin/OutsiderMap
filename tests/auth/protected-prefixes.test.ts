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
  "/admin",
  // Revived as the street-easy drop-a-spot flow (link or name + comment).
  "/submit",
];

const RETIRED = ["/onboarding", "/reels", "/join", "/thank-you"];

// Anon-viewable by design: the shared taste card is the invite loop's landing
// page and its opengraph-image is fetched by link scrapers - it must never
// sit behind the auth wall.
const PUBLIC_SURFACES = ["/card", "/place", "/privacy", "/terms"];

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

  it("never walls off the public share surfaces", () => {
    for (const prefix of PUBLIC_SURFACES) {
      expect(PROTECTED_PREFIXES, `${prefix} must stay public`).not.toContain(
        prefix,
      );
    }
  });

  it("contains only well-formed root prefixes", () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect(prefix).toMatch(/^\/[a-z-]+$/);
    }
    expect(new Set(PROTECTED_PREFIXES).size).toBe(PROTECTED_PREFIXES.length);
  });
});
