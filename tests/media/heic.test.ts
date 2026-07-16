import { describe, expect, it } from "vitest";
import { isHeicBytes } from "@/lib/media/image";

function bmff(brand: string): Uint8Array {
  // [4-byte size][ftyp][brand]
  const bytes = new Uint8Array(12);
  bytes.set([0, 0, 0, 24]);
  bytes.set([..."ftyp"].map((c) => c.charCodeAt(0)), 4);
  bytes.set([...brand].map((c) => c.charCodeAt(0)), 8);
  return bytes;
}

describe("isHeicBytes", () => {
  it.each(["heic", "heix", "mif1", "hevc"])(
    "detects the %s brand",
    (brand) => {
      expect(isHeicBytes(bmff(brand))).toBe(true);
    },
  );

  it("passes ordinary MP4s through", () => {
    expect(isHeicBytes(bmff("isom"))).toBe(false);
    expect(isHeicBytes(bmff("mp42"))).toBe(false);
  });

  it("passes JPEG/PNG bytes through", () => {
    expect(isHeicBytes(new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      false,
    );
    expect(isHeicBytes(new Uint8Array(4))).toBe(false);
  });
});
