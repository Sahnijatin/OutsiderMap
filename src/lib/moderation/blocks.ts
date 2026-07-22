import { z } from "zod";

/** Pure block helpers, shared by the block route and the feed/profile filter. */

export const BlockTargetSchema = z.string().uuid();

/** You can never block yourself (the DB CHECK enforces it too). */
export function isSelfBlock(viewerId: string, targetId: string): boolean {
  return viewerId === targetId;
}
