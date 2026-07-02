import { describe, it, expect } from "vitest";
import { sniffImageExt } from "@/lib/media/image";

function fileOf(bytes: number[], name = "x"): File {
  // Pad to 12 bytes so the sniffer always has a full header to read.
  const padded = new Uint8Array(12);
  padded.set(bytes.slice(0, 12));
  return new File([padded], name);
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("sniffImageExt", () => {
  it("identifies JPEG by magic bytes", async () => {
    expect(await sniffImageExt(fileOf(JPEG))).toBe("jpg");
  });

  it("identifies PNG by magic bytes", async () => {
    expect(await sniffImageExt(fileOf(PNG))).toBe("png");
  });

  it("identifies WEBP by RIFF/WEBP header", async () => {
    expect(await sniffImageExt(fileOf(WEBP))).toBe("webp");
  });

  it("returns null for a non-image (e.g. a PDF header)", async () => {
    expect(await sniffImageExt(fileOf([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it("does not trust the filename/extension, only the bytes", async () => {
    // Named .png but the bytes are JPEG -> sniffed as jpg.
    expect(await sniffImageExt(fileOf(JPEG, "photo.png"))).toBe("jpg");
  });
});
