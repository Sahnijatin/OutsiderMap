import { describe, expect, it } from "vitest";
import {
  adminMediaDescriptor,
  adminMediaMime,
  allowedAdminMediaExt,
  MAX_ADMIN_MEDIA_BATCH,
  MAX_ADMIN_MEDIA_BYTES,
} from "@/lib/media/admin-media";

describe("allowedAdminMediaExt", () => {
  it("accepts the photo formats a phone or a desk actually produces", () => {
    for (const ext of ["jpg", "png", "webp", "heic", "heif"]) {
      expect(allowedAdminMediaExt("image", ext)).toBe(true);
    }
  });

  it("accepts the clip formats a phone actually produces", () => {
    for (const ext of ["mp4", "webm", "mov", "m4v"]) {
      expect(allowedAdminMediaExt("video", ext)).toBe(true);
    }
  });

  it("does not let a kind borrow the other kind's extensions", () => {
    expect(allowedAdminMediaExt("image", "mp4")).toBe(false);
    expect(allowedAdminMediaExt("video", "jpg")).toBe(false);
  });

  it("rejects anything else", () => {
    for (const ext of ["exe", "svg", "gif", "pdf", ""]) {
      expect(allowedAdminMediaExt("image", ext)).toBe(false);
      expect(allowedAdminMediaExt("video", ext)).toBe(false);
    }
  });
});

describe("adminMediaDescriptor", () => {
  it("reads a plain photo from its MIME type", () => {
    expect(adminMediaDescriptor({ name: "shot.JPG", type: "image/jpeg" })).toEqual(
      { kind: "image", ext: "jpg" },
    );
  });

  it("reads a clip from its MIME type", () => {
    expect(adminMediaDescriptor({ name: "clip.MP4", type: "video/mp4" })).toEqual(
      { kind: "video", ext: "mp4" },
    );
  });

  it("normalises the shapes browsers report", () => {
    // Safari hands back quicktime for a .mov; jpeg and jpg are the same file.
    expect(
      adminMediaDescriptor({ name: "a.mov", type: "video/quicktime" })?.ext,
    ).toBe("mov");
    expect(adminMediaDescriptor({ name: "a.jpeg", type: "image/jpeg" })?.ext).toBe(
      "jpg",
    );
  });

  it("falls back to the filename when the MIME type is useless", () => {
    // Android reports application/octet-stream for plenty of real videos; a
    // strict MIME check is exactly how video "stopped working".
    expect(
      adminMediaDescriptor({ name: "VID_0001.mp4", type: "application/octet-stream" }),
    ).toEqual({ kind: "video", ext: "mp4" });
    expect(
      adminMediaDescriptor({ name: "IMG_0001.heic", type: "" }),
    ).toEqual({ kind: "image", ext: "heic" });
  });

  it("prefers the MIME type's kind over a misleading name", () => {
    expect(
      adminMediaDescriptor({ name: "actually.mp4.png", type: "image/png" }),
    ).toEqual({ kind: "image", ext: "png" });
  });

  it("returns null for anything we don't accept", () => {
    expect(adminMediaDescriptor({ name: "notes.pdf", type: "application/pdf" })).toBeNull();
    expect(adminMediaDescriptor({ name: "map.svg", type: "image/svg+xml" })).toBeNull();
    expect(adminMediaDescriptor({ name: "noextension", type: "" })).toBeNull();
  });
});

describe("adminMediaMime", () => {
  it("gives video extensions a playable content type", () => {
    // Stored with the wrong content type, a clip downloads instead of playing.
    expect(adminMediaMime("mp4")).toBe("video/mp4");
    expect(adminMediaMime("mov")).toBe("video/quicktime");
    expect(adminMediaMime("webm")).toBe("video/webm");
  });

  it("covers every extension the allowlist accepts", () => {
    for (const ext of ["jpg", "png", "webp", "heic", "heif", "mp4", "m4v", "webm", "mov"]) {
      expect(adminMediaMime(ext)).toBeTruthy();
    }
  });
});

describe("limits", () => {
  it("matches the bucket ceiling set in migration 57", () => {
    expect(MAX_ADMIN_MEDIA_BYTES).toBe(52428800);
  });

  it("lets a reviewer attach several files in one turn", () => {
    expect(MAX_ADMIN_MEDIA_BATCH).toBeGreaterThan(1);
  });
});
