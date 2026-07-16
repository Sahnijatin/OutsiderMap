import { describe, expect, it } from "vitest";
import {
  counterpartId,
  FriendSearchSchema,
  partitionFriendships,
  type FriendshipRow,
  type PublicMember,
} from "@/lib/friends/model";

const ME = "00000000-0000-0000-0000-0000000000aa";
const ALICE = "00000000-0000-0000-0000-0000000000bb";
const BOB = "00000000-0000-0000-0000-0000000000cc";

function row(overrides: Partial<FriendshipRow>): FriendshipRow {
  return {
    id: "f-1",
    requester: ME,
    addressee: ALICE,
    status: "pending",
    created_at: "2026-07-01T00:00:00Z",
    responded_at: null,
    ...overrides,
  };
}

const MEMBERS = new Map<string, PublicMember>([
  [ALICE, { id: ALICE, username: "alice", display_name: "Alice", outsider_number: 7 }],
  [BOB, { id: BOB, username: "bob", display_name: null, outsider_number: 12 }],
]);

describe("FriendSearchSchema", () => {
  it("lowercases and trims", () => {
    expect(FriendSearchSchema.parse("  AlI_9 ")).toBe("ali_9");
  });

  it("rejects one-char and illegal characters", () => {
    expect(FriendSearchSchema.safeParse("a").success).toBe(false);
    expect(FriendSearchSchema.safeParse("has space").success).toBe(false);
    expect(FriendSearchSchema.safeParse("semi;colon").success).toBe(false);
  });
});

describe("partitionFriendships", () => {
  it("splits accepted, incoming and outgoing from the viewer's seat", () => {
    const rows = [
      row({ id: "f-1", requester: ME, addressee: ALICE, status: "accepted", responded_at: "2026-07-02T00:00:00Z" }),
      row({ id: "f-2", requester: BOB, addressee: ME, status: "pending" }),
      row({ id: "f-3", requester: ME, addressee: BOB, status: "pending" }),
    ];
    const parts = partitionFriendships(rows, ME, MEMBERS);
    expect(parts.friends.map((f) => f.memberId)).toEqual([ALICE]);
    expect(parts.friends[0].since).toBe("2026-07-02T00:00:00Z");
    expect(parts.incoming.map((f) => f.memberId)).toEqual([BOB]);
    expect(parts.outgoing.map((f) => f.memberId)).toEqual([BOB]);
  });

  it("attaches the counterpart's public member row when known", () => {
    const parts = partitionFriendships(
      [row({ status: "accepted" })],
      ME,
      MEMBERS,
    );
    expect(parts.friends[0].member?.username).toBe("alice");
  });

  it("drops rows the viewer is not part of", () => {
    const parts = partitionFriendships(
      [row({ requester: ALICE, addressee: BOB })],
      ME,
      MEMBERS,
    );
    expect(parts.friends).toEqual([]);
    expect(parts.incoming).toEqual([]);
    expect(parts.outgoing).toEqual([]);
  });

  it("counterpartId flips by seat", () => {
    const r = row({});
    expect(counterpartId(r, ME)).toBe(ALICE);
    expect(counterpartId(r, ALICE)).toBe(ME);
  });
});
