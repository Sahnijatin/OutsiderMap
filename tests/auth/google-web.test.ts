import { describe, expect, it } from "vitest";
import { resolveWebGoogleEnabled } from "@/lib/auth/google-web";

/**
 * Whether the web "Continue with Google" button renders.
 *
 * Before this gate existed the button rendered unconditionally, so a
 * deployment without the Supabase Google provider showed every visitor a
 * button that failed. The single most important case here is the first one.
 */

describe("resolveWebGoogleEnabled", () => {
  it("is OFF when nothing is configured", () => {
    // The whole point. An unconfigured deployment must not offer Google.
    expect(resolveWebGoogleEnabled({})).toBe(false);
    expect(resolveWebGoogleEnabled({ flag: null, webClientId: null })).toBe(
      false,
    );
    expect(
      resolveWebGoogleEnabled({ flag: undefined, webClientId: undefined }),
    ).toBe(false);
  });

  it("is on when the web client id is present", () => {
    expect(
      resolveWebGoogleEnabled({ webClientId: "123.apps.googleusercontent.com" }),
    ).toBe(true);
  });

  it.each(["1", "true", "TRUE", " 1 ", "True"])(
    "is on when the flag says %s, with no client id",
    (flag) => {
      expect(resolveWebGoogleEnabled({ flag })).toBe(true);
    },
  );

  it.each(["0", "false", "FALSE", " 0 "])(
    "is off when the flag says %s, even with a client id",
    (flag) => {
      expect(resolveWebGoogleEnabled({ flag, webClientId: "abc" })).toBe(false);
    },
  );

  it("treats a whitespace-only value as unset", () => {
    expect(resolveWebGoogleEnabled({ webClientId: "   " })).toBe(false);
    expect(resolveWebGoogleEnabled({ flag: "   ", webClientId: "" })).toBe(
      false,
    );
  });

  it("ignores an unrecognised flag and falls back to the client id", () => {
    expect(resolveWebGoogleEnabled({ flag: "maybe", webClientId: "abc" })).toBe(
      true,
    );
    expect(resolveWebGoogleEnabled({ flag: "maybe" })).toBe(false);
  });
});
