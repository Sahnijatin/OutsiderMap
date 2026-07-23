import { describe, expect, it } from "vitest";
import {
  parseCachedLocation,
  LOCATION_CACHE_TTL_MS,
} from "@/lib/map/location";

const NOW = 1_700_000_000_000;

describe("parseCachedLocation", () => {
  it("returns a fresh cached location", () => {
    const raw = JSON.stringify({ lat: 28.55, lng: 77.19, at: NOW - 1000 });
    expect(parseCachedLocation(raw, NOW)).toEqual({
      lat: 28.55,
      lng: 77.19,
      at: NOW - 1000,
    });
  });

  it("drops entries older than the TTL", () => {
    const raw = JSON.stringify({
      lat: 28.55,
      lng: 77.19,
      at: NOW - LOCATION_CACHE_TTL_MS - 1,
    });
    expect(parseCachedLocation(raw, NOW)).toBeNull();
  });

  it("rejects null, malformed JSON, and non-numeric coords", () => {
    expect(parseCachedLocation(null, NOW)).toBeNull();
    expect(parseCachedLocation("not json", NOW)).toBeNull();
    expect(
      parseCachedLocation(JSON.stringify({ lat: "x", lng: 77, at: NOW }), NOW),
    ).toBeNull();
    expect(
      parseCachedLocation(JSON.stringify({ lat: 28.5, lng: 77 }), NOW),
    ).toBeNull();
  });
});
