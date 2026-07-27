import { describe, expect, it } from "vitest";
import {
  authorPostUpdateError,
  canViewPost,
  commentCountDelta,
  reactionCountDelta,
  type PostGuardRow,
  type PostVisibilityRow,
  type ViewerContext,
} from "@/lib/feed/model";

const ME = "00000000-0000-0000-0000-0000000000aa";
const AUTHOR = "00000000-0000-0000-0000-0000000000bb";

function post(overrides: Partial<PostVisibilityRow>): PostVisibilityRow {
  return { author_id: AUTHOR, visibility: "public", status: "approved", ...overrides };
}

function ctx(overrides: Partial<ViewerContext>): ViewerContext {
  return { viewerId: ME, ...overrides };
}

describe("canViewPost", () => {
  it("hides everything from signed-out callers", () => {
    expect(canViewPost(post({}), ctx({ viewerId: null }))).toBe(false);
  });

  it("lets the author see their own post at any status", () => {
    const mine = post({ author_id: ME, status: "pending", visibility: "private" });
    expect(canViewPost(mine, ctx({ viewerId: ME }))).toBe(true);
  });

  it("lets an admin see any post", () => {
    expect(canViewPost(post({ status: "pending" }), ctx({ isAdmin: true }))).toBe(true);
  });

  it("shows approved public posts to any member but hides unapproved ones", () => {
    expect(canViewPost(post({ visibility: "public", status: "approved" }), ctx({}))).toBe(true);
    expect(canViewPost(post({ visibility: "public", status: "pending" }), ctx({}))).toBe(false);
    expect(canViewPost(post({ visibility: "public", status: "removed" }), ctx({}))).toBe(false);
  });

  it("gates followers posts on the follow set", () => {
    const p = post({ visibility: "followers" });
    expect(canViewPost(p, ctx({ following: new Set([AUTHOR]) }))).toBe(true);
    expect(canViewPost(p, ctx({ following: new Set() }))).toBe(false);
    expect(canViewPost(p, ctx({}))).toBe(false);
  });

  it("never shows a private post to anyone but the author", () => {
    const p = post({ visibility: "private" });
    expect(canViewPost(p, ctx({ following: new Set([AUTHOR]) }))).toBe(false);
    expect(canViewPost({ ...p, author_id: ME }, ctx({ viewerId: ME }))).toBe(true);
  });
});

describe("authorPostUpdateError", () => {
  const base: PostGuardRow = {
    author_id: ME,
    created_at: "2026-07-01T00:00:00Z",
    status: "pending",
    like_count: 0,
    comment_count: 0,
    want_count: 0,
  };

  it("allows an edit that leaves identity, status and counters untouched", () => {
    expect(authorPostUpdateError(base, { ...base })).toBeNull();
  });

  it("blocks a self-approval", () => {
    expect(authorPostUpdateError(base, { ...base, status: "approved" })).toMatch(/moderation/);
  });

  it("blocks reassigning authorship or backdating", () => {
    expect(authorPostUpdateError(base, { ...base, author_id: AUTHOR })).toMatch(/author/);
    expect(authorPostUpdateError(base, { ...base, created_at: "2020-01-01T00:00:00Z" })).toMatch(/created_at/);
  });

  it("blocks hand-setting the counters", () => {
    expect(authorPostUpdateError(base, { ...base, like_count: 99 })).toMatch(/counters/);
    expect(authorPostUpdateError(base, { ...base, comment_count: 5 })).toMatch(/counters/);
    expect(authorPostUpdateError(base, { ...base, want_count: 5 })).toMatch(/counters/);
  });
});

describe("reactionCountDelta", () => {
  it("moves only the matching counter, by sign of the op", () => {
    expect(reactionCountDelta("INSERT", "like")).toEqual({ like: 1, want: 0 });
    expect(reactionCountDelta("DELETE", "like")).toEqual({ like: -1, want: 0 });
    expect(reactionCountDelta("INSERT", "want_to_go")).toEqual({ like: 0, want: 1 });
    expect(reactionCountDelta("DELETE", "want_to_go")).toEqual({ like: 0, want: -1 });
  });
});

describe("commentCountDelta", () => {
  it("counts an inserted approved comment, ignores an inserted removed one", () => {
    expect(commentCountDelta("INSERT", null, "approved")).toBe(1);
    expect(commentCountDelta("INSERT", null, "removed")).toBe(0);
  });

  it("decrements when an approved comment is deleted", () => {
    expect(commentCountDelta("DELETE", "approved", null)).toBe(-1);
    expect(commentCountDelta("DELETE", "removed", null)).toBe(0);
  });

  it("moves the counter only when an update crosses the approved boundary", () => {
    expect(commentCountDelta("UPDATE", "approved", "removed")).toBe(-1);
    expect(commentCountDelta("UPDATE", "removed", "approved")).toBe(1);
    expect(commentCountDelta("UPDATE", "approved", "approved")).toBe(0);
  });
});
