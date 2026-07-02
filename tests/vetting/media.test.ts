import { describe, it, expect } from "vitest";
import {
  putVettingImage,
  signVettingUrls,
  signVettingUrl,
  MEMBER_VETTING_BUCKET,
} from "@/lib/vetting/media";

function jpeg() {
  const b = new Uint8Array(12);
  b.set([0xff, 0xd8, 0xff]);
  return new File([b], "selfie.jpg");
}

describe("putVettingImage", () => {
  it("uploads to the private bucket with the sniffed extension", async () => {
    let seen: { bucket: string; path: string } | null = null;
    const admin = {
      storage: {
        from(bucket: string) {
          return {
            upload: async (path: string) => {
              seen = { bucket, path };
              return { error: null };
            },
          };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const path = await putVettingImage(admin, "vetting/OUT-ABCD/selfie", jpeg());
    expect(path).toBe("vetting/OUT-ABCD/selfie.jpg");
    expect(seen).toEqual({
      bucket: MEMBER_VETTING_BUCKET,
      path: "vetting/OUT-ABCD/selfie.jpg",
    });
  });

  it("rejects a non-image", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = { storage: { from: () => ({ upload: async () => ({ error: null }) }) } } as any;
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "x.pdf");
    await expect(
      putVettingImage(admin, "vetting/x/selfie", pdf),
    ).rejects.toThrow(/supported image/i);
  });
});

function signerAdmin(
  result: { data: Array<{ error: string | null; signedUrl: string | null }> | null; error: unknown },
) {
  return {
    storage: {
      from() {
        return {
          createSignedUrls: async () => result,
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://signed/${path}` },
            error: null,
          }),
        };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("signVettingUrls", () => {
  it("returns [] for no paths without calling storage", async () => {
    expect(await signVettingUrls(signerAdmin({ data: [], error: null }), [])).toEqual([]);
  });

  it("preserves input order and pairs each path with its url", async () => {
    const admin = signerAdmin({
      data: [
        { error: null, signedUrl: "https://a" },
        { error: null, signedUrl: "https://b" },
      ],
      error: null,
    });
    expect(await signVettingUrls(admin, ["a.jpg", "b.jpg"])).toEqual([
      { path: "a.jpg", signedUrl: "https://a" },
      { path: "b.jpg", signedUrl: "https://b" },
    ]);
  });

  it("nulls out entries that failed to sign", async () => {
    const admin = signerAdmin({
      data: [
        { error: "gone", signedUrl: null },
        { error: null, signedUrl: "https://b" },
      ],
      error: null,
    });
    expect(await signVettingUrls(admin, ["a.jpg", "b.jpg"])).toEqual([
      { path: "a.jpg", signedUrl: null },
      { path: "b.jpg", signedUrl: "https://b" },
    ]);
  });

  it("nulls all when the batch call errors", async () => {
    const admin = signerAdmin({ data: null, error: { message: "boom" } });
    expect(await signVettingUrls(admin, ["a.jpg"])).toEqual([
      { path: "a.jpg", signedUrl: null },
    ]);
  });
});

describe("signVettingUrl", () => {
  it("returns null for an empty path", async () => {
    expect(await signVettingUrl(signerAdmin({ data: [], error: null }), null)).toBeNull();
  });
});
