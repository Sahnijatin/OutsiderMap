import { describe, expect, it } from "vitest";
import {
  FollowTargetSchema,
  isSelfFollow,
  normalizeFollowState,
} from "@/lib/feed/follows";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("FollowTargetSchema", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(FollowTargetSchema.safeParse(OTHER).success).toBe(true);
    expect(FollowTargetSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(FollowTargetSchema.safeParse("").success).toBe(false);
  });
});

describe("isSelfFollow", () => {
  it("is true only when the ids match", () => {
    expect(isSelfFollow(ME, ME)).toBe(true);
    expect(isSelfFollow(ME, OTHER)).toBe(false);
  });
});

describe("normalizeFollowState", () => {
  it("maps a row to camelCase", () => {
    expect(
      normalizeFollowState({
        follower_count: 12,
        following_count: 3,
        is_following: true,
        follows_you: false,
      }),
    ).toEqual({
      followerCount: 12,
      followingCount: 3,
      isFollowing: true,
      followsYou: false,
    });
  });

  it("defaults a missing row to zeroes and false", () => {
    expect(normalizeFollowState(null)).toEqual({
      followerCount: 0,
      followingCount: 0,
      isFollowing: false,
      followsYou: false,
    });
    expect(normalizeFollowState(undefined).followerCount).toBe(0);
  });
});
