import { describe, expect, it } from "vitest";
import {
  normaliseMediaExt,
  resolveMediaDescriptor,
} from "@/lib/media/file-kind";
import { allowedPostMediaExt } from "@/lib/feed/compose";

describe("normaliseMediaExt", () => {
  it("collapses the aliases browsers report", () => {
    expect(normaliseMediaExt("JPEG")).toBe("jpg");
    expect(normaliseMediaExt("quicktime")).toBe("mov");
    expect(normaliseMediaExt("x-m4v")).toBe("m4v");
  });

  it("survives nothing at all", () => {
    expect(normaliseMediaExt(undefined)).toBe("");
    expect(normaliseMediaExt("")).toBe("");
  });
});

describe("resolveMediaDescriptor", () => {
  it("uses the MIME type when it is meaningful", () => {
    expect(
      resolveMediaDescriptor({ name: "a.jpg", type: "image/jpeg" }, allowedPostMediaExt),
    ).toEqual({ kind: "image", ext: "jpg" });
    expect(
      resolveMediaDescriptor({ name: "a.mov", type: "video/quicktime" }, allowedPostMediaExt),
    ).toEqual({ kind: "video", ext: "mov" });
  });

  it("recovers a video whose Content-Type says nothing", () => {
    // This is the regression that made "video doesn't work" true on Android:
    // an octet-stream MP4 was classified as an image and then rejected for
    // not being a supported image format.
    expect(
      resolveMediaDescriptor(
        { name: "VID_20260806.mp4", type: "application/octet-stream" },
        allowedPostMediaExt,
      ),
    ).toEqual({ kind: "video", ext: "mp4" });
    expect(
      resolveMediaDescriptor({ name: "clip.webm", type: "" }, allowedPostMediaExt),
    ).toEqual({ kind: "video", ext: "webm" });
  });

  it("trusts a declared kind over a misleading filename", () => {
    expect(
      resolveMediaDescriptor(
        { name: "screenshot-of-a.mp4.png", type: "image/png" },
        allowedPostMediaExt,
      ),
    ).toEqual({ kind: "image", ext: "png" });
  });

  it("falls back to the filename when the MIME subtype is not an extension", () => {
    // Safari can report image/jpeg for a file literally named .jpg, but the
    // reverse - a type we allow under a name we don't - must not sneak past.
    expect(
      resolveMediaDescriptor({ name: "photo", type: "image/png" }, allowedPostMediaExt),
    ).toEqual({ kind: "image", ext: "png" });
  });

  it("returns null when nothing about the file is acceptable", () => {
    expect(
      resolveMediaDescriptor({ name: "notes.pdf", type: "application/pdf" }, allowedPostMediaExt),
    ).toBeNull();
    expect(
      resolveMediaDescriptor({ name: "archive", type: "" }, allowedPostMediaExt),
    ).toBeNull();
  });

  it("respects the caller's allowlist", () => {
    const imagesOnly = (kind: "image" | "video", ext: string) =>
      kind === "image" && ext === "jpg";
    expect(
      resolveMediaDescriptor({ name: "a.mp4", type: "video/mp4" }, imagesOnly),
    ).toBeNull();
    expect(
      resolveMediaDescriptor({ name: "a.jpg", type: "image/jpeg" }, imagesOnly),
    ).toEqual({ kind: "image", ext: "jpg" });
  });
});
