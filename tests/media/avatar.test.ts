import { describe, expect, it } from "vitest";
import {
  allowedAvatarExt,
  avatarPath,
  avatarPrefix,
  avatarPublicUrl,
  AvatarConfirmSchema,
  AvatarIssueSchema,
  AVATAR_BUCKET,
  MAX_AVATAR_BYTES,
} from "@/lib/media/avatar";

/**
 * Avatar upload paths. The storage policy for the bucket is
 * `(storage.foldername(name))[2] = auth.uid()::text`, so the shape these
 * functions produce is not cosmetic - it is the thing standing between one
 * member and another member's photos.
 */

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

describe("avatarPath", () => {
  it("sits under the owner's prefix", () => {
    expect(avatarPath({ userId: USER_A, ext: "jpg" })).toMatch(
      new RegExp(`^a/${USER_A}/[0-9a-f-]{36}\\.jpg$`),
    );
  });

  it("never collides for the same user", () => {
    const paths = new Set(
      Array.from({ length: 50 }, () => avatarPath({ userId: USER_A, ext: "png" })),
    );
    expect(paths.size).toBe(50);
  });

  it("keeps one user's path outside another's prefix", () => {
    const a = avatarPath({ userId: USER_A, ext: "jpg" });
    expect(a.startsWith(avatarPrefix(USER_B))).toBe(false);
    expect(a.startsWith(avatarPrefix(USER_A))).toBe(true);
  });

  it("puts the uid in the segment the storage policy reads", () => {
    // storage.foldername() splits on "/", and the policy indexes [2] - which
    // is 1-based in Postgres, so it is the second segment: the uid.
    const segments = avatarPath({ userId: USER_A, ext: "jpg" }).split("/");
    expect(segments[0]).toBe("a");
    expect(segments[1]).toBe(USER_A);
    expect(segments).toHaveLength(3);
  });
});

describe("allowedAvatarExt", () => {
  it.each(["jpg", "jpeg", "png", "webp", "heic", "heif"])(
    "accepts %s",
    (ext) => {
      expect(allowedAvatarExt(ext)).toBe(true);
    },
  );

  it.each(["mp4", "mov", "svg", "html", "js", "pdf", "gif", ""])(
    "rejects %s",
    (ext) => {
      expect(allowedAvatarExt(ext)).toBe(false);
    },
  );
});

describe("AvatarIssueSchema", () => {
  it("lowercases the extension", () => {
    expect(AvatarIssueSchema.parse({ ext: "JPG", size: 100 }).ext).toBe("jpg");
  });

  it("rejects a path fragment posing as an extension", () => {
    expect(AvatarIssueSchema.safeParse({ ext: "../../x", size: 1 }).success).toBe(
      false,
    );
    expect(AvatarIssueSchema.safeParse({ ext: "jp/g", size: 1 }).success).toBe(
      false,
    );
  });

  it("rejects a zero or negative size", () => {
    expect(AvatarIssueSchema.safeParse({ ext: "jpg", size: 0 }).success).toBe(
      false,
    );
    expect(AvatarIssueSchema.safeParse({ ext: "jpg", size: -1 }).success).toBe(
      false,
    );
  });

  it("rejects an over-cap size before a URL is ever minted", () => {
    expect(
      AvatarIssueSchema.safeParse({ ext: "jpg", size: MAX_AVATAR_BYTES + 1 })
        .success,
    ).toBe(false);
    expect(
      AvatarIssueSchema.safeParse({ ext: "jpg", size: MAX_AVATAR_BYTES }).success,
    ).toBe(true);
  });
});

describe("AvatarConfirmSchema", () => {
  it("requires a path", () => {
    expect(AvatarConfirmSchema.safeParse({ path: "" }).success).toBe(false);
    expect(AvatarConfirmSchema.safeParse({}).success).toBe(false);
  });

  it("caps the path length", () => {
    expect(
      AvatarConfirmSchema.safeParse({ path: "a".repeat(301) }).success,
    ).toBe(false);
  });
});

describe("avatarPublicUrl", () => {
  it("builds the public object URL", () => {
    expect(avatarPublicUrl("https://x.supabase.co", "a/u/1.jpg")).toBe(
      `https://x.supabase.co/storage/v1/object/public/${AVATAR_BUCKET}/a/u/1.jpg`,
    );
  });

  it("tolerates a trailing slash on the base URL", () => {
    expect(avatarPublicUrl("https://x.supabase.co/", "a/u/1.jpg")).toBe(
      `https://x.supabase.co/storage/v1/object/public/${AVATAR_BUCKET}/a/u/1.jpg`,
    );
  });
});

describe("caps", () => {
  it("keeps the 5MB avatar cap the client and the schema both assume", () => {
    expect(MAX_AVATAR_BYTES).toBe(5 * 1024 * 1024);
  });
});
