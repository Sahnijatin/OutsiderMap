import { describe, expect, it } from "vitest";
import { buildReelPost, buildReelPostMedia } from "@/lib/feed/reel-post";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLACE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POST = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("buildReelPost", () => {
  it("maps a reel to a public video post (status left to default)", () => {
    const post = buildReelPost({
      userId: USER,
      placeId: PLACE,
      city: "delhi",
      caption: "Friday crawl",
    });
    expect(post).toEqual({
      author_id: USER,
      type: "video",
      place_id: PLACE,
      city: "delhi",
      body: "Friday crawl",
      visibility: "public",
      location_precision: "exact",
    });
    expect("status" in post).toBe(false);
  });

  it("carries a null place and caption through", () => {
    const post = buildReelPost({ userId: USER, placeId: null, city: "delhi", caption: null });
    expect(post.place_id).toBeNull();
    expect(post.body).toBeNull();
  });
});

describe("buildReelPostMedia", () => {
  it("maps to a single video media row at ordinal 0 with the given bucket", () => {
    expect(
      buildReelPostMedia({
        postId: POST,
        videoPath: "r/q/1.mp4",
        posterPath: "r/q/1.jpg",
        bucket: "reel-media",
      }),
    ).toEqual({
      post_id: POST,
      kind: "video",
      path: "r/q/1.mp4",
      poster_path: "r/q/1.jpg",
      ordinal: 0,
      bucket: "reel-media",
    });
  });
});
