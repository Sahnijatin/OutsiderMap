import { describe, expect, it } from "vitest";
import {
  allowedPlacePhotoExt,
  MAX_PLACE_PHOTO_BYTES,
  placePhotoPath,
  placePhotoPrefix,
  PlacePhotoConfirmSchema,
  PlacePhotoIssueSchema,
} from "@/lib/media/place-photo";

const USER = "11111111-1111-4111-8111-111111111111";
const PLACE = "22222222-2222-4222-8222-222222222222";

describe("placePhotoPath", () => {
  it("prefixes with the contributor and the place", () => {
    // The storage policy and the confirm route both trust this prefix, so
    // its shape is load-bearing rather than cosmetic.
    const path = placePhotoPath({ userId: USER, placeId: PLACE, ext: "jpg" });
    expect(path.startsWith(placePhotoPrefix(USER, PLACE))).toBe(true);
    expect(path.endsWith(".jpg")).toBe(true);
  });

  it("never collides for the same user and place", () => {
    const a = placePhotoPath({ userId: USER, placeId: PLACE, ext: "jpg" });
    const b = placePhotoPath({ userId: USER, placeId: PLACE, ext: "jpg" });
    expect(a).not.toBe(b);
  });

  it("does not let one contributor's prefix match another's", () => {
    const other = "33333333-3333-4333-8333-333333333333";
    const path = placePhotoPath({ userId: USER, placeId: PLACE, ext: "jpg" });
    expect(path.startsWith(placePhotoPrefix(other, PLACE))).toBe(false);
    expect(path.startsWith(placePhotoPrefix(USER, other))).toBe(false);
  });
});

describe("allowedPlacePhotoExt", () => {
  it("accepts the formats phones actually produce", () => {
    for (const ext of ["jpg", "jpeg", "png", "webp", "heic", "heif"]) {
      expect(allowedPlacePhotoExt(ext)).toBe(true);
    }
  });

  it("rejects video and anything executable", () => {
    for (const ext of ["mp4", "mov", "svg", "html", "js", "pdf"]) {
      expect(allowedPlacePhotoExt(ext)).toBe(false);
    }
  });
});

describe("PlacePhotoIssueSchema", () => {
  it("lowercases the extension", () => {
    expect(PlacePhotoIssueSchema.parse({ ext: "JPG", size: 100 }).ext).toBe("jpg");
  });

  it("rejects a path smuggled through the extension", () => {
    expect(
      PlacePhotoIssueSchema.safeParse({ ext: "../../x", size: 100 }).success,
    ).toBe(false);
  });

  it("rejects a non-positive size", () => {
    expect(PlacePhotoIssueSchema.safeParse({ ext: "jpg", size: 0 }).success).toBe(
      false,
    );
  });
});

describe("PlacePhotoConfirmSchema", () => {
  it("takes an optional caption and capture point", () => {
    const parsed = PlacePhotoConfirmSchema.parse({
      path: "c/u/p/x.jpg",
      caption: "  the corner table  ",
      capturedLat: 28.6494,
      capturedLng: 77.2335,
    });
    expect(parsed.caption).toBe("the corner table");
    expect(parsed.capturedLat).toBe(28.6494);
  });

  it("rejects an out-of-range coordinate", () => {
    expect(
      PlacePhotoConfirmSchema.safeParse({ path: "c/u/p/x.jpg", capturedLat: 91 })
        .success,
    ).toBe(false);
  });

  it("requires a path", () => {
    expect(PlacePhotoConfirmSchema.safeParse({ path: "" }).success).toBe(false);
  });
});

describe("size cap", () => {
  it("is a phone photo, not a video", () => {
    expect(MAX_PLACE_PHOTO_BYTES).toBe(12 * 1024 * 1024);
  });
});
