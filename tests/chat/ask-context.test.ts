import { describe, expect, it } from "vitest";

import { AskContextSchema, originOf } from "@/lib/chat/ask-context";

/**
 * What the member is doing when they ask. It arrives in a request body, so the
 * validation here is the boundary between a client hint and something the
 * concierge treats as fact.
 */

describe("AskContextSchema", () => {
  it("accepts an empty context - every field is a hint, none required", () => {
    expect(AskContextSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a position and a place the ask started from", () => {
    const parsed = AskContextSchema.safeParse({
      city: "delhi",
      lat: 28.61,
      lng: 77.21,
      placeSlug: "karims-jama-masjid",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects coordinates off the globe", () => {
    expect(AskContextSchema.safeParse({ lat: 91 }).success).toBe(false);
    expect(AskContextSchema.safeParse({ lng: -181 }).success).toBe(false);
  });

  it("rejects anything that is not a catalog slug", () => {
    // The slug reaches a query, so the shape is checked before it gets there.
    for (const placeSlug of [
      "Karims",
      "karims jama masjid",
      "../../etc/passwd",
      "karims'; drop table places;--",
      "a".repeat(200),
    ]) {
      expect(
        AskContextSchema.safeParse({ placeSlug }).success,
        placeSlug,
      ).toBe(false);
    }
  });

  it("rejects a city string long enough to be an attack rather than a slug", () => {
    expect(AskContextSchema.safeParse({ city: "x".repeat(200) }).success).toBe(
      false,
    );
  });
});

describe("originOf", () => {
  it("reads a usable position", () => {
    expect(originOf({ lat: 28.61, lng: 77.21 })).toEqual({
      lat: 28.61,
      lng: 77.21,
    });
  });

  it("needs both halves", () => {
    // A lone latitude is a client bug. Guessing the other half would put a
    // confident wrong distance in front of the model.
    expect(originOf({ lat: 28.61 })).toBeNull();
    expect(originOf({ lng: 77.21 })).toBeNull();
    expect(originOf({})).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });

  it("rejects null island", () => {
    // (0, 0) is the classic uninitialised coordinate. It is in the Gulf of
    // Guinea, so no Delhi member is ever legitimately there - and taking it at
    // face value would make every place ~7000km away.
    expect(originOf({ lat: 0, lng: 0 })).toBeNull();
    // A real zero on one axis is still fine.
    expect(originOf({ lat: 0, lng: 77.21 })).toEqual({ lat: 0, lng: 77.21 });
  });
});
