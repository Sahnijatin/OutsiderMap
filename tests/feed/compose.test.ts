import { describe, expect, it } from "vitest";
import {
  allowedPostMediaExt,
  CreatePostSchema,
  MediaConfirmSchema,
  MediaIssueSchema,
  PostPatchSchema,
} from "@/lib/feed/compose";

const PLACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("CreatePostSchema", () => {
  it("accepts a place-anchored post and defaults visibility + precision", () => {
    const parsed = CreatePostSchema.parse({ type: "photo", place_id: PLACE });
    expect(parsed.visibility).toBe("public");
    expect(parsed.location_precision).toBe("exact");
  });

  it("accepts a note-only or action-only post", () => {
    expect(CreatePostSchema.safeParse({ type: "status", body: "great night" }).success).toBe(true);
    expect(CreatePostSchema.safeParse({ type: "status", action: "eating" }).success).toBe(true);
  });

  it("rejects an empty post (no place, note, or action)", () => {
    expect(CreatePostSchema.safeParse({ type: "status" }).success).toBe(false);
  });

  it("rejects an unknown type or visibility", () => {
    expect(CreatePostSchema.safeParse({ type: "poll", body: "x" }).success).toBe(false);
    expect(
      CreatePostSchema.safeParse({ type: "status", body: "x", visibility: "world" }).success,
    ).toBe(false);
  });
});

describe("PostPatchSchema", () => {
  it("accepts a partial edit", () => {
    expect(PostPatchSchema.safeParse({ body: "edited" }).success).toBe(true);
    expect(PostPatchSchema.safeParse({ visibility: "followers" }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(PostPatchSchema.safeParse({}).success).toBe(false);
  });
});

describe("allowedPostMediaExt", () => {
  it("allows image and video extensions by kind, and nothing crossed", () => {
    expect(allowedPostMediaExt("image", "jpg")).toBe(true);
    expect(allowedPostMediaExt("image", "webp")).toBe(true);
    expect(allowedPostMediaExt("video", "mp4")).toBe(true);
    expect(allowedPostMediaExt("image", "mp4")).toBe(false);
    expect(allowedPostMediaExt("video", "jpg")).toBe(false);
    expect(allowedPostMediaExt("image", "gif")).toBe(false);
  });
});

describe("media payload schemas", () => {
  it("validates an issue request", () => {
    expect(MediaIssueSchema.safeParse({ kind: "image", ext: "jpg", size: 1000 }).success).toBe(true);
    expect(MediaIssueSchema.safeParse({ kind: "image", ext: "jpg", size: 0 }).success).toBe(false);
    expect(MediaIssueSchema.safeParse({ kind: "image", ext: "j/g", size: 1 }).success).toBe(false);
  });

  it("validates a confirm request with optional poster", () => {
    expect(MediaConfirmSchema.safeParse({ path: "p/u/post/x.jpg", kind: "image" }).success).toBe(true);
    expect(
      MediaConfirmSchema.safeParse({ path: "p/u/post/x.mp4", kind: "video", posterPath: "p/u/post/x.jpg" }).success,
    ).toBe(true);
    expect(MediaConfirmSchema.safeParse({ path: "", kind: "image" }).success).toBe(false);
  });
});
