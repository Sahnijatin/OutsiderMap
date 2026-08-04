import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isCrossOriginWrite } from "@/lib/security/origin";

/**
 * The cross-origin write check (#148). Two things it must never get wrong: a
 * legitimate same-origin write from the app must not be blocked (that breaks
 * every mutation), and a cross-site POST must not be allowed (that is the bug).
 */

function req(
  method: string,
  headers: Record<string, string> = {},
  url = "https://www.outsidermap.com/api/posts",
): Request {
  return new Request(url, { method, headers });
}

describe("isCrossOriginWrite", () => {
  it("never blocks safe methods, whatever the origin", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) {
      expect(
        isCrossOriginWrite(
          req(method, {
            "sec-fetch-site": "cross-site",
            origin: "https://evil.example",
          }),
        ),
      ).toBe(false);
    }
  });

  it("allows the app calling itself", () => {
    expect(
      isCrossOriginWrite(req("POST", { "sec-fetch-site": "same-origin" })),
    ).toBe(false);
  });

  it("allows a user-initiated load with no initiator document", () => {
    expect(isCrossOriginWrite(req("POST", { "sec-fetch-site": "none" }))).toBe(
      false,
    );
  });

  it("blocks a cross-site write", () => {
    expect(
      isCrossOriginWrite(req("POST", { "sec-fetch-site": "cross-site" })),
    ).toBe(true);
  });

  it("blocks same-site, because a sibling subdomain is still not us", () => {
    // A cookie scoped to the parent domain is sent here too, which is the
    // whole reason this case is not treated as trusted.
    expect(
      isCrossOriginWrite(req("POST", { "sec-fetch-site": "same-site" })),
    ).toBe(true);
  });

  it("blocks every unsafe method, not just POST", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        isCrossOriginWrite(req(method, { "sec-fetch-site": "cross-site" })),
      ).toBe(true);
    }
  });

  describe("without Sec-Fetch-Site (older browsers)", () => {
    it("falls back to comparing Origin against Host", () => {
      expect(
        isCrossOriginWrite(
          req("POST", {
            origin: "https://www.outsidermap.com",
            host: "www.outsidermap.com",
          }),
        ),
      ).toBe(false);
      expect(
        isCrossOriginWrite(
          req("POST", {
            origin: "https://evil.example",
            host: "www.outsidermap.com",
          }),
        ),
      ).toBe(true);
    });

    it("prefers X-Forwarded-Host, since the proxy rewrites Host", () => {
      expect(
        isCrossOriginWrite(
          req("POST", {
            origin: "https://www.outsidermap.com",
            "x-forwarded-host": "www.outsidermap.com",
            host: "internal-vercel-host.vercel.app",
          }),
        ),
      ).toBe(false);
    });

    it("reads only the first entry of a proxy chain", () => {
      expect(
        isCrossOriginWrite(
          req("POST", {
            origin: "https://www.outsidermap.com",
            "x-forwarded-host": "www.outsidermap.com, inner.proxy",
          }),
        ),
      ).toBe(false);
    });

    it("allows a request that sends no Origin at all", () => {
      // curl, server-to-server, native clients. A browser always sends Origin
      // on a cross-origin write, so absence is proof this is not one - and
      // none of these carry ambient cookies anyway.
      expect(isCrossOriginWrite(req("POST", {}))).toBe(false);
    });

    it("blocks an Origin that cannot be parsed", () => {
      expect(
        isCrossOriginWrite(
          req("POST", { origin: "not a url", host: "www.outsidermap.com" }),
        ),
      ).toBe(true);
    });

    it("treats a differing port as cross-origin", () => {
      expect(
        isCrossOriginWrite(
          req("POST", {
            origin: "https://www.outsidermap.com:8443",
            host: "www.outsidermap.com",
          }),
        ),
      ).toBe(true);
    });
  });
});
