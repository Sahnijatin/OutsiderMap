import { describe, expect, it } from "vitest";
import {
  AUTH_NEXT_COOKIE,
  AUTH_NEXT_MAX_AGE_SECONDS,
  authNextCookieString,
} from "@/lib/auth/session";

/**
 * The post-OAuth destination cookie.
 *
 * It was written inline in the sign-in panel with no `secure` attribute, so on
 * https it travelled in the clear. Moving it here beside the preference cookie
 * fixes that and makes the attributes testable.
 */

describe("authNextCookieString", () => {
  it("is marked secure on https", () => {
    expect(authNextCookieString("/map", true)).toContain("secure");
  });

  it("is NOT marked secure on http, so local dev still works", () => {
    expect(authNextCookieString("/map", false)).not.toContain("secure");
  });

  it("stays SameSite=Lax", () => {
    // Strict would drop the cookie on the return from Google, which is a
    // top-level cross-site GET - exactly when it is needed.
    const cookie = authNextCookieString("/map", true);
    expect(cookie).toContain("samesite=lax");
    expect(cookie).not.toContain("samesite=strict");
  });

  it("is scoped to the whole site and expires in ten minutes", () => {
    const cookie = authNextCookieString("/map", true);
    expect(cookie).toContain("path=/");
    expect(cookie).toContain(`max-age=${AUTH_NEXT_MAX_AGE_SECONDS}`);
    expect(AUTH_NEXT_MAX_AGE_SECONDS).toBe(600);
  });

  it("carries the destination", () => {
    expect(authNextCookieString("/quests?new=1", true)).toContain(
      `${AUTH_NEXT_COOKIE}=${encodeURIComponent("/quests?new=1")}`,
    );
  });

  it("encodes a value that would otherwise split the cookie", () => {
    const cookie = authNextCookieString("/a; evil=1", true);
    // One attribute-bearing semicolon per attribute, none smuggled in by the
    // value itself.
    expect(cookie).not.toContain("evil=1;");
    expect(cookie).toContain("%3B");
  });

  it("names the cookie the callback route reads", () => {
    expect(AUTH_NEXT_COOKIE).toBe("om_auth_next");
  });
});
