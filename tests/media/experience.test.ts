import { describe, it, expect } from "vitest";
import {
  uploadExperienceMedia,
  EXPERIENCE_MEDIA_BUCKET,
} from "@/lib/media/experience";

type Upload = { path: string; opts: { contentType?: string } };

function fakeAdmin(uploadError: string | null = null) {
  const uploads: Upload[] = [];
  const admin = {
    storage: {
      from(bucket: string) {
        expect(bucket).toBe(EXPERIENCE_MEDIA_BUCKET);
        return {
          upload: async (path: string, _file: unknown, opts: Upload["opts"]) => {
            uploads.push({ path, opts });
            return { error: uploadError ? { message: uploadError } : null };
          },
        };
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, uploads };
}

function imageFile() {
  const b = new Uint8Array(12);
  b.set([0xff, 0xd8, 0xff]); // JPEG
  return new File([b], "x.jpg");
}

function videoFile() {
  const b = new Uint8Array(12); // not an image header
  return new File([b], "clip.mp4", { type: "video/mp4" });
}

describe("uploadExperienceMedia", () => {
  it("stores an image with the sniffed extension + content type", async () => {
    const { admin, uploads } = fakeAdmin();
    const res = await uploadExperienceMedia(admin, "experiences/s/card-0", imageFile());
    expect(res).toEqual({
      mediaPath: "experiences/s/card-0.jpg",
      mediaType: "image",
    });
    expect(uploads[0].opts.contentType).toBe("image/jpeg");
  });

  it("accepts allowlisted video by content type", async () => {
    const { admin, uploads } = fakeAdmin();
    const res = await uploadExperienceMedia(admin, "experiences/s/card-1", videoFile());
    expect(res).toEqual({
      mediaPath: "experiences/s/card-1.mp4",
      mediaType: "video",
    });
    expect(uploads[0].opts.contentType).toBe("video/mp4");
  });

  it("rejects an oversized file before uploading", async () => {
    const { admin, uploads } = fakeAdmin();
    const huge = {
      size: 51 * 1024 * 1024,
      type: "image/jpeg",
      slice: () => ({ arrayBuffer: async () => new Uint8Array(12).buffer }),
    } as unknown as File;
    await expect(
      uploadExperienceMedia(admin, "experiences/s/card-2", huge),
    ).rejects.toThrow(/too large/i);
    expect(uploads).toHaveLength(0);
  });

  it("rejects unsupported media (neither image nor allowlisted video)", async () => {
    const { admin } = fakeAdmin();
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "x.pdf", {
      type: "application/pdf",
    });
    await expect(
      uploadExperienceMedia(admin, "experiences/s/card-3", pdf),
    ).rejects.toThrow(/unsupported/i);
  });

  it("surfaces a storage upload error", async () => {
    const { admin } = fakeAdmin("bucket missing");
    await expect(
      uploadExperienceMedia(admin, "experiences/s/card-4", imageFile()),
    ).rejects.toThrow(/bucket missing/);
  });
});
