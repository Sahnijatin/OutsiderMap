import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

import { isMapsUrl, parseMapsUrl } from "@/lib/ingest/maps-url";

describe("isMapsUrl", () => {
  it.each([
    ["https://maps.app.goo.gl/AbCdEf123", true],
    ["https://goo.gl/maps/xyz", true],
    ["https://www.google.com/maps/place/Cafe+Lota/@28.61,77.24,17z", true],
    ["https://maps.google.com/?q=Roshan+Di+Kulfi", true],
    ["https://www.google.com/search?q=cafe", false],
    ["https://instagram.com/reel/abc", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(isMapsUrl(url)).toBe(expected);
  });
});

describe("parseMapsUrl", () => {
  it("reads name and exact pin from a full place URL", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/place/Roshan+Di+Kulfi/@28.6519,77.1907,17z/data=!3m1!4b1!4m6!3m5!1s0xabc:0xdef!8m2!3d28.6519469!4d77.1907423!16s",
    );
    expect(parsed.name).toBe("Roshan Di Kulfi");
    // The !3d/!4d pin beats the /@ viewport centre.
    expect(parsed.lat).toBeCloseTo(28.6519469);
    expect(parsed.lng).toBeCloseTo(77.1907423);
  });

  it("falls back to viewport coordinates when there is no pin", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/place/Cafe+Lota/@28.6101,77.2432,17z",
    );
    expect(parsed.name).toBe("Cafe Lota");
    expect(parsed.lat).toBeCloseTo(28.6101);
    expect(parsed.lng).toBeCloseTo(77.2432);
  });

  it("decodes URI-encoded names", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/place/Karim's%20Restaurant/@28.65,77.23,17z",
    );
    expect(parsed.name).toBe("Karim's Restaurant");
  });

  it("reads a ?q= search as a query, but never a bare coordinate pair", () => {
    expect(parseMapsUrl("https://maps.google.com/?q=Sita+Ram+Diwan+Chand").query).toBe(
      "Sita Ram Diwan Chand",
    );
    expect(parseMapsUrl("https://maps.google.com/?q=28.65,77.23").query).toBeNull();
  });

  it("reads /maps/search/ URLs", () => {
    expect(
      parseMapsUrl("https://www.google.com/maps/search/paranthe+wali+gali").query,
    ).toBe("paranthe wali gali");
  });

  it("returns an empty parse for garbage without throwing", () => {
    expect(parseMapsUrl("not a url")).toEqual({
      name: null,
      lat: null,
      lng: null,
      query: null,
    });
  });
});
