import { z } from "zod";

/**
 * Pure follow-graph helpers: the target-id schema, the self-follow guard, and
 * the shaping of the `follow_state` RPC row into the object the client uses.
 * No IO, so it unit-tests cleanly; the API route and profile screen share it.
 */

export const FollowTargetSchema = z.string().uuid();

/** The `follow_state(target)` RPC row shape (snake_case, from PostgREST). */
export type FollowStateRow = {
  follower_count: number;
  following_count: number;
  is_following: boolean;
  follows_you: boolean;
};

/** Client-facing follow state. */
export type FollowState = {
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  followsYou: boolean;
};

/** A member can never follow themselves (the DB CHECK enforces it too). */
export function isSelfFollow(viewerId: string, targetId: string): boolean {
  return viewerId === targetId;
}

/** Shape a `follow_state` row into camelCase, defaulting a missing row to zero. */
export function normalizeFollowState(
  row: FollowStateRow | null | undefined,
): FollowState {
  return {
    followerCount: row?.follower_count ?? 0,
    followingCount: row?.following_count ?? 0,
    isFollowing: row?.is_following ?? false,
    followsYou: row?.follows_you ?? false,
  };
}
