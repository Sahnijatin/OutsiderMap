import { describe, expect, it } from "vitest";
import {
  AUTH_CALLBACK_ERRORS,
  callbackErrorCopy,
  friendlyAuthError,
} from "@/lib/auth/auth-errors";

/**
 * Sign-in error copy. Every one of these paths used to render the provider's
 * own string, so the binding assertion is the last one: whatever goes in, it
 * does not come back out.
 */

const REAL_SUPABASE_STRINGS = [
  "Unsupported provider: provider is not enabled",
  "AuthApiError: Invalid login credentials",
  "Token has expired or is invalid",
  "Failed to fetch",
  "Request rate limit reached",
  "User cancelled the sign-in flow",
  "something nobody has ever seen before",
];

describe("friendlyAuthError", () => {
  it("explains a disabled provider instead of quoting Supabase", () => {
    expect(friendlyAuthError("Unsupported provider: provider is not enabled"))
      .toBe("Google sign-in isn't switched on yet. Use the email code below.");
  });

  it("treats a cancelled sheet as a change of mind", () => {
    expect(friendlyAuthError("User cancelled the sign-in flow")).toMatch(
      /cancelled/i,
    );
  });

  it("names the network when the network is the problem", () => {
    expect(friendlyAuthError("Failed to fetch")).toMatch(/network/i);
  });

  it("tells a rate-limited member to wait", () => {
    expect(friendlyAuthError("Request rate limit reached")).toMatch(/wait/i);
  });

  it("points an expired code back at the email", () => {
    expect(friendlyAuthError("Token has expired or is invalid")).toMatch(
      /check the email/i,
    );
  });

  it.each([null, undefined, "", "   "])("falls back for %s", (raw) => {
    expect(friendlyAuthError(raw)).toBe("Sign-in didn't go through. Try again.");
  });

  // The guard that makes this module worth having.
  it("never leaks the provider's own words to the screen", () => {
    for (const raw of REAL_SUPABASE_STRINGS) {
      const copy = friendlyAuthError(raw);
      expect(copy).not.toContain(raw);
      expect(copy.toLowerCase()).not.toContain("supabase");
      expect(copy.toLowerCase()).not.toContain("provider is not enabled");
      expect(copy).not.toContain("http");
      expect(copy).not.toContain("{");
    }
  });

  it("always returns something to show", () => {
    for (const raw of [...REAL_SUPABASE_STRINGS, "", null]) {
      expect(friendlyAuthError(raw).length).toBeGreaterThan(0);
    }
  });
});

describe("callbackErrorCopy", () => {
  it("distinguishes backing out from a broken link", () => {
    expect(callbackErrorCopy("cancelled")).not.toBe(
      callbackErrorCopy("auth"),
    );
    expect(callbackErrorCopy("cancelled")).toMatch(/backed out/i);
  });

  it("explains an unconfigured provider", () => {
    expect(callbackErrorCopy("config")).toMatch(/isn't switched on/i);
  });

  it.each([null, undefined, "", "banana"])(
    "falls back to the generic line for %s",
    (code) => {
      expect(callbackErrorCopy(code)).toBe(AUTH_CALLBACK_ERRORS.auth);
    },
  );
});
