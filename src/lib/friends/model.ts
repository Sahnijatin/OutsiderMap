import { z } from "zod";

/**
 * Pure friends-domain helpers: schema for the typeahead and partitioning of
 * raw friendship rows into the three lists the UI renders. No IO here so it
 * unit-tests cleanly.
 */

/** Looser than UsernameSchema: a 2-char prefix is enough to search. */
export const FriendSearchSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{2,20}$/, "2-20 characters: letters, numbers, underscores.");

export type FriendshipRow = {
  id: string;
  requester: string;
  addressee: string;
  status: "pending" | "accepted";
  created_at: string;
  responded_at: string | null;
};

export type PublicMember = {
  id: string;
  username: string;
  display_name: string | null;
  outsider_number: number | null;
};

export type FriendEntry = {
  friendshipId: string;
  memberId: string;
  member: PublicMember | null;
  since: string;
};

export type Partitioned = {
  friends: FriendEntry[];
  incoming: FriendEntry[];
  outgoing: FriendEntry[];
};

/** The other participant of a friendship row, from the viewer's seat. */
export function counterpartId(row: FriendshipRow, viewerId: string) {
  return row.requester === viewerId ? row.addressee : row.requester;
}

/**
 * Split raw rows into accepted friends, requests waiting on the viewer
 * (incoming) and requests the viewer sent (outgoing). Rows the viewer isn't
 * part of are dropped defensively - RLS should never produce them.
 */
export function partitionFriendships(
  rows: FriendshipRow[],
  viewerId: string,
  members: Map<string, PublicMember>,
): Partitioned {
  const out: Partitioned = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    if (row.requester !== viewerId && row.addressee !== viewerId) continue;
    const memberId = counterpartId(row, viewerId);
    const entry: FriendEntry = {
      friendshipId: row.id,
      memberId,
      member: members.get(memberId) ?? null,
      since: row.responded_at ?? row.created_at,
    };
    if (row.status === "accepted") out.friends.push(entry);
    else if (row.addressee === viewerId) out.incoming.push(entry);
    else out.outgoing.push(entry);
  }
  return out;
}
