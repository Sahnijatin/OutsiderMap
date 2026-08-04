import { describe, expect, it } from "vitest";
import {
  applySessionLifetime,
  readSessionPersistence,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_PREF_COOKIE,
  SESSION_PREF_MAX_AGE_SECONDS,
  sessionPrefCookieString,
} from "@/lib/auth/session";

/**
 * The "stay logged in" choice, end to end at the pure layer.
 *
 * These matter more than most: @supabase/ssr forces its own 400-day maxAge
 * onto every cookie write, so applySessionLifetime is the ONLY thing deciding
 * how long a member stays signed in - and the maxAge:0 branch is the only
 * thing making sign-out actually delete the cookie rather than reissue it as
 * an empty session cookie.
 */

/** What @supabase/ssr hands setAll on a normal write. */
const WRITE = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  maxAge: 400 * 24 * 60 * 60,
};

/** What it hands setAll when expiring a cookie (sign-out). */
const DELETE = { ...WRITE, maxAge: 0 };

describe("readSessionPersistence", () => {
  it("honours an explicit session-only choice", () => {
    expect(readSessionPersistence("session")).toBe("session");
  });

  it.each([["persistent"], [undefined], [null], [""], ["true"], ["0"], ["junk"]])(
    "defaults to persistent for %s",
    (raw) => {
      // Load-bearing twice: existing members have no cookie and must not be
      // signed out on deploy, and native never writes one at all.
      expect(readSessionPersistence(raw)).toBe("persistent");
    },
  );
});

describe("applySessionLifetime", () => {
  it("pins a persistent session to the 60-day window", () => {
    const out = applySessionLifetime(WRITE, "persistent", "token");
    expect(out.maxAge).toBe(SESSION_COOKIE_MAX_AGE_SECONDS);
  });

  it("keeps the other cookie attributes untouched", () => {
    const out = applySessionLifetime(WRITE, "persistent", "token");
    expect(out.path).toBe("/");
    expect(out.sameSite).toBe("lax");
    expect(out.httpOnly).toBe(false);
  });

  it("removes the lifetime keys entirely for a session-only choice", () => {
    const out = applySessionLifetime(WRITE, "session", "token");
    // Absence, not undefined: cookie's serialize checks `maxAge !== undefined`
    // and Next's edge cookies check `"maxAge" in options`.
    expect("maxAge" in out).toBe(false);
    expect("expires" in out).toBe(false);
    expect(out.path).toBe("/");
  });

  it("drops an absolute expiry too, or the cookie would still outlive the browser", () => {
    const withExpiry = { ...WRITE, expires: new Date("2027-01-01T00:00:00Z") };
    const out = applySessionLifetime(withExpiry, "session", "token");
    expect("expires" in out).toBe(false);
  });

  it.each([["persistent"], ["session"]] as const)(
    "passes a deletion through unchanged in %s mode",
    (mode) => {
      // Break this and sign-out silently stops deleting the cookie.
      const out = applySessionLifetime(DELETE, mode, "");
      expect(out.maxAge).toBe(0);
    },
  );

  it("passes an empty value through even without maxAge:0", () => {
    const out = applySessionLifetime(WRITE, "session", "");
    expect(out.maxAge).toBe(WRITE.maxAge);
  });

  it("does not mutate its input", () => {
    const input = { ...WRITE };
    applySessionLifetime(input, "session", "token");
    applySessionLifetime(input, "persistent", "token");
    expect(input).toEqual(WRITE);
  });
});

describe("sessionPrefCookieString", () => {
  it("writes the choice at the root path for the whole 400-day window", () => {
    const str = sessionPrefCookieString("session", false);
    expect(str).toContain(`${SESSION_PREF_COOKIE}=session`);
    expect(str).toContain("path=/");
    expect(str).toContain(`max-age=${SESSION_PREF_MAX_AGE_SECONDS}`);
  });

  it("stays SameSite=Lax so it survives the Google OAuth return", () => {
    // Under Strict the cookie would not ride the top-level cross-site GET back
    // to /auth/callback, silently upgrading that member to persistent.
    expect(sessionPrefCookieString("session", true)).toContain("samesite=lax");
  });

  it("is secure on https and not on plain http", () => {
    expect(sessionPrefCookieString("persistent", true)).toContain("secure");
    expect(sessionPrefCookieString("persistent", false)).not.toContain("secure");
  });

  it("round-trips through readSessionPersistence", () => {
    for (const mode of ["persistent", "session"] as const) {
      const value = sessionPrefCookieString(mode, true)
        .split(";")[0]
        .split("=")[1];
      expect(readSessionPersistence(value)).toBe(mode);
    }
  });
});
