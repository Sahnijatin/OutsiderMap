import { z } from "zod";

/**
 * Pure feed-domain helpers: a faithful TS mirror of the load-bearing SQL in
 * migration 0017_feed - per-post visibility (`can_view_post`), the author
 * status/counter guard (`protect_post_columns`), and the counter deltas the
 * reaction/comment triggers apply. No IO, so it unit-tests cleanly and gives
 * the API layer one source of truth for "who may see this / touch this".
 *
 * These are a second line of defence and a spec for the DB, never a
 * replacement: RLS in the migration is the real gate.
 */

export const POST_TYPES = ["status", "photo", "video", "review", "list"] as const;
export const POST_VISIBILITIES = ["public", "followers", "private"] as const;
export const POST_STATUSES = ["pending", "approved", "rejected", "removed"] as const;
export const LOCATION_PRECISIONS = ["exact", "area", "hidden"] as const;
export const REACTION_KINDS = ["like", "want_to_go"] as const;

/**
 * Social posts default to the *area*, not the exact spot (#122): sharing your
 * life shouldn't broadcast a pinpoint unless you deliberately choose to.
 */
export const DEFAULT_LOCATION_PRECISION = "area" as const;

export type PostType = (typeof POST_TYPES)[number];
export type PostVisibility = (typeof POST_VISIBILITIES)[number];
export type PostStatus = (typeof POST_STATUSES)[number];
export type LocationPrecision = (typeof LOCATION_PRECISIONS)[number];
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const PostVisibilitySchema = z.enum(POST_VISIBILITIES);
export const ReactionKindSchema = z.enum(REACTION_KINDS);

/** The fields of a post that decide who may see it. */
export type PostVisibilityRow = {
  author_id: string;
  visibility: PostVisibility;
  status: PostStatus;
};

/**
 * The viewer and the slice of the social graph relevant to them. `following`
 * is the set of author ids the viewer follows. A null `viewerId` is a
 * signed-out caller.
 */
export type ViewerContext = {
  viewerId: string | null;
  isAdmin?: boolean;
  following?: ReadonlySet<string>;
};

/**
 * Mirror of `public.can_view_post`. Author and admin see everything of theirs;
 * everyone else sees only approved posts, gated by visibility. Signed-out
 * callers see nothing (the feed is members-only).
 */
export function canViewPost(post: PostVisibilityRow, ctx: ViewerContext): boolean {
  const viewer = ctx.viewerId;
  if (!viewer) return false;
  if (post.author_id === viewer) return true;
  if (ctx.isAdmin) return true;
  if (post.status !== "approved") return false;
  switch (post.visibility) {
    case "public":
      return true;
    case "followers":
      return ctx.following?.has(post.author_id) ?? false;
    case "private":
      return false;
    default:
      return false;
  }
}

/** The mutable-by-anyone shape the author guard inspects. */
export type PostGuardRow = {
  author_id: string;
  created_at: string;
  status: PostStatus;
  like_count: number;
  comment_count: number;
  want_count: number;
};

/**
 * Mirror of `public.protect_post_columns` for a non-privileged (author) edit.
 * Returns the error the trigger would raise, or null if the change is allowed.
 * Authors may edit body/visibility/etc. but never their post's identity,
 * moderation status, or counters.
 */
export function authorPostUpdateError(
  prev: PostGuardRow,
  next: PostGuardRow,
): string | null {
  if (next.author_id !== prev.author_id) return "post author is immutable";
  if (next.created_at !== prev.created_at) return "post created_at is immutable";
  if (next.status !== prev.status) return "post status is advanced by moderation only";
  if (
    next.like_count !== prev.like_count ||
    next.comment_count !== prev.comment_count ||
    next.want_count !== prev.want_count
  ) {
    return "post counters are maintained by triggers";
  }
  return null;
}

export type RowOp = "INSERT" | "DELETE";

/**
 * Mirror of `sync_post_reaction_counts`: the delta a reaction applies to a
 * post's like/want counters. Counters never go below zero in the DB; that
 * clamp is applied where the running total is known, not here.
 */
export function reactionCountDelta(
  op: RowOp,
  kind: ReactionKind,
): { like: number; want: number } {
  const sign = op === "INSERT" ? 1 : -1;
  return {
    like: kind === "like" ? sign : 0,
    want: kind === "want_to_go" ? sign : 0,
  };
}

/**
 * Mirror of `sync_post_comment_counts`: the delta to a post's comment_count.
 * Only `approved` comments count, so crossing the approved boundary on an
 * update is what moves the counter.
 */
export function commentCountDelta(
  op: RowOp | "UPDATE",
  prevStatus: "approved" | "removed" | null,
  nextStatus: "approved" | "removed" | null,
): number {
  if (op === "INSERT") return nextStatus === "approved" ? 1 : 0;
  if (op === "DELETE") return prevStatus === "approved" ? -1 : 0;
  // UPDATE: only a crossing of the approved boundary moves the count.
  if (prevStatus === "approved" && nextStatus !== "approved") return -1;
  if (prevStatus !== "approved" && nextStatus === "approved") return 1;
  return 0;
}
