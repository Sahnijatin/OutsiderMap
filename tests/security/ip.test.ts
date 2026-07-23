import { describe, expect, it } from "vitest";
import { getClientIp, rateLimitSubject } from "@/lib/security/ip";

function req(headers: Record<string, string>): Request {
  return new Request("https://outsidermap.com/api/map/places", { headers });
}

describe("getClientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
  });

  it("trims whitespace and falls back to x-real-ip", () => {
    expect(getClientIp(req({ "x-forwarded-for": "  198.51.100.2 " }))).toBe(
      "198.51.100.2",
    );
    expect(getClientIp(req({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("returns null when no IP header is present", () => {
    expect(getClientIp(req({}))).toBeNull();
  });
});

describe("rateLimitSubject", () => {
  it("keys by user id when signed in", () => {
    expect(rateLimitSubject({ id: "user-123" }, req({}))).toBe("user-123");
  });

  it("keys by IP when anonymous", () => {
    expect(
      rateLimitSubject(null, req({ "x-forwarded-for": "203.0.113.5" })),
    ).toBe("ip:203.0.113.5");
  });

  it("degrades to ip:unknown when anon and IP-less (never throws)", () => {
    expect(rateLimitSubject(null, req({}))).toBe("ip:unknown");
  });
});
