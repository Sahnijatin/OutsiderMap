import { describe, expect, it } from "vitest";
import { googleMapsDirUrl } from "@/lib/map/directions";

/**
 * The bug these lock down: the old builder sent Google the string
 * "Karim's 28.6494,77.2335" as the destination, which is a *text search*.
 * Delhi has a dozen Karim's, so the matcher regularly picked the wrong one.
 */
describe("googleMapsDirUrl", () => {
  const KARIMS = {
    lat: 28.6494,
    lng: 77.2335,
    name: "Karim's",
    googlePlaceId: "ChIJexample123",
  };

  it("sends destination_place_id when we have one", () => {
    const params = new URL(googleMapsDirUrl(KARIMS)).searchParams;
    expect(params.get("destination_place_id")).toBe("ChIJexample123");
    expect(params.get("api")).toBe("1");
  });

  it("keeps the name readable alongside the place_id", () => {
    const params = new URL(googleMapsDirUrl(KARIMS)).searchParams;
    expect(params.get("destination")).toBe("Karim's");
  });

  it("never text-searches a name without a place_id", () => {
    // The old behaviour. A confident wrong match is worse than an unnamed
    // pin on the right spot, so with no place_id we send coordinates only.
    const params = new URL(
      googleMapsDirUrl({ lat: 28.6494, lng: 77.2335, name: "Karim's" }),
    ).searchParams;
    expect(params.get("destination")).toBe("28.6494,77.2335");
    expect(params.get("destination")).not.toContain("Karim");
    expect(params.has("destination_place_id")).toBe(false);
  });

  it("treats null/empty place ids as absent", () => {
    for (const googlePlaceId of [null, undefined, ""]) {
      const params = new URL(
        googleMapsDirUrl({ ...KARIMS, googlePlaceId })
      ).searchParams;
      expect(params.has("destination_place_id")).toBe(false);
      expect(params.get("destination")).toBe("28.6494,77.2335");
    }
  });

  it("falls back to coordinates for the destination label when unnamed", () => {
    const params = new URL(
      googleMapsDirUrl({ lat: 28.6494, lng: 77.2335, googlePlaceId: "ChIJx" }),
    ).searchParams;
    expect(params.get("destination")).toBe("28.6494,77.2335");
    expect(params.get("destination_place_id")).toBe("ChIJx");
  });

  it("still accepts the legacy positional signature", () => {
    const params = new URL(
      googleMapsDirUrl(28.6494, 77.2335, "Karim's"),
    ).searchParams;
    expect(params.get("destination")).toBe("28.6494,77.2335");
  });

  it("points at Google Maps directions", () => {
    expect(googleMapsDirUrl(KARIMS)).toMatch(
      /^https:\/\/www\.google\.com\/maps\/dir\/\?/,
    );
  });
});
