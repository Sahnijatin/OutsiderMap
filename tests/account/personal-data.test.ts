import { describe, expect, it } from "vitest";
import {
  NOT_PERSONAL,
  PERSONAL_DATA,
  eraseTables,
  exportTables,
  retainedTables,
  storageTargets,
  subjectFilters,
} from "@/lib/account/personal-data";
import { MEMBER_VETTING_BUCKET } from "@/lib/vetting/media";
import { QUEST_MEDIA_BUCKET } from "@/lib/media/quest";
import { POST_MEDIA_BUCKET } from "@/lib/media/post";
import { EXPERIENCE_MEDIA_BUCKET } from "@/lib/media/experience";
import { PLACE_PHOTO_BUCKET } from "@/lib/media/place-photo";
import {
  directlyUserKeyed,
  indirectlyUserKeyed,
  parseSchema,
} from "./migration-schema";

/**
 * The drift guard.
 *
 * DELETE /api/account carried a hand-written table list that had silently
 * fallen ~20 tables behind the schema, and nobody noticed because most of them
 * happened to cascade. This test is why that cannot happen again: it reads the
 * migrations and fails the build when a user-keyed table has no answer to
 * "what happens to this on export and on erasure".
 *
 * If this test fails after you added a table, it is not being pedantic - go
 * add the entry to PERSONAL_DATA, or to NOT_PERSONAL with the reason.
 */

const schema = parseSchema();
const KNOWN_BUCKETS = new Set([
  MEMBER_VETTING_BUCKET,
  QUEST_MEDIA_BUCKET,
  POST_MEDIA_BUCKET,
  EXPERIENCE_MEDIA_BUCKET,
  PLACE_PHOTO_BUCKET,
]);

const classified = new Set<string>([
  ...PERSONAL_DATA.map((t) => t.table as string),
  ...NOT_PERSONAL.map((t) => t.table as string),
]);

describe("the migration reader", () => {
  it("sees the schema at all", () => {
    expect(schema.size).toBeGreaterThan(40);
    expect(schema.has("profiles")).toBe(true);
    expect(schema.has("interaction_events")).toBe(true);
  });

  it("replays drops, so retired tables are gone", () => {
    // Created in migration 01 and 13, dropped in 44 and 45. A parser that read
    // only `create table` would demand these be classified.
    expect(schema.has("subscriptions")).toBe(false);
    expect(schema.has("reels")).toBe(false);
    expect(schema.has("reel_jobs")).toBe(false);
  });

  it("picks up foreign keys added by ALTER, not just CREATE", () => {
    const places = schema.get("places");
    const columns = places?.foreignKeys.map((fk) => fk.column) ?? [];
    expect(columns).toContain("submitted_by");
    expect(columns).toContain("claimed_by");
  });
});

describe("every user-keyed table is classified", () => {
  it("covers tables with a direct profiles or auth.users FK", () => {
    for (const table of directlyUserKeyed(schema)) {
      expect(
        classified.has(table),
        `${table} references a member but is in neither PERSONAL_DATA nor NOT_PERSONAL`,
      ).toBe(true);
    }
  });

  it("covers tables reachable one hop further out", () => {
    // post_media lives here: no user column, personal anyway.
    for (const table of indirectlyUserKeyed(schema)) {
      expect(
        classified.has(table),
        `${table} hangs off a member-owned table but is unclassified`,
      ).toBe(true);
    }
  });

  it("classifies post_media, the case a direct-FK scan misses", () => {
    expect(indirectlyUserKeyed(schema)).toContain("post_media");
    const entry = PERSONAL_DATA.find((t) => t.table === "post_media");
    expect(entry?.storage?.bucket).toBe(POST_MEDIA_BUCKET);
  });
});

describe("the registry is internally coherent", () => {
  it("references only tables that still exist", () => {
    for (const entry of [...PERSONAL_DATA, ...NOT_PERSONAL]) {
      expect(
        schema.has(entry.table as string),
        `${entry.table} is in the registry but not in the schema`,
      ).toBe(true);
    }
  });

  it("lists no table twice", () => {
    const names = [...PERSONAL_DATA, ...NOT_PERSONAL].map((t) => t.table);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives a reason for everything it keeps", () => {
    for (const entry of retainedTables()) {
      expect(entry.retainReason?.trim(), `${entry.table} retains without a reason`)
        .toBeTruthy();
    }
    for (const entry of NOT_PERSONAL) {
      expect(entry.reason.trim(), `${entry.table} is excused without a reason`)
        .toBeTruthy();
    }
  });

  it("only claims a cascade the SQL actually declares", () => {
    for (const entry of PERSONAL_DATA) {
      if (entry.erase !== "cascade") continue;
      const table = schema.get(entry.table as string);
      expect(table, `${entry.table} missing from schema`).toBeDefined();

      const cascades = table!.foreignKeys.some((fk) => fk.onDelete === "cascade");
      expect(
        cascades,
        `${entry.table} is marked erase:"cascade" but declares no ON DELETE CASCADE - ` +
          `it would survive erasure`,
      ).toBe(true);
    }
  });

  it("only names buckets that exist", () => {
    for (const entry of storageTargets()) {
      expect(
        KNOWN_BUCKETS.has(entry.storage!.bucket),
        `${entry.table} points at unknown bucket ${entry.storage!.bucket}`,
      ).toBe(true);
    }
  });

  it("deletes storage-bearing rows only after their objects are collected", () => {
    // eraseSubject purges storage before any row deletion; this pins the
    // ordering assumption the registry encodes rather than the code path.
    for (const entry of storageTargets()) {
      expect(["explicit", "cascade"]).toContain(entry.erase);
    }
  });
});

describe("subjectFilters", () => {
  const subject = { userId: "u-1", email: "member@example.com" };

  it("filters a plain owner column", () => {
    const entry = PERSONAL_DATA.find((t) => t.table === "member_memory")!;
    expect(subjectFilters(entry, subject)).toEqual([
      { column: "user_id", value: "u-1" },
    ]);
  });

  it("returns both sides of a two-party row", () => {
    const entry = PERSONAL_DATA.find((t) => t.table === "follows")!;
    expect(subjectFilters(entry, subject)).toEqual([
      { column: "follower", value: "u-1" },
      { column: "followee", value: "u-1" },
    ]);
  });

  it("matches the waitlist by email", () => {
    const entry = PERSONAL_DATA.find((t) => t.table === "waitlist")!;
    expect(subjectFilters(entry, subject)).toEqual([
      { column: "email", value: "member@example.com" },
    ]);
  });

  it("declines the waitlist when the subject has no email", () => {
    const entry = PERSONAL_DATA.find((t) => t.table === "waitlist")!;
    expect(subjectFilters(entry, { userId: "u-1", email: null })).toBeNull();
  });

  it("defers via-parent tables to the caller", () => {
    const entry = PERSONAL_DATA.find((t) => t.table === "post_media")!;
    expect(subjectFilters(entry, subject)).toBeNull();
  });
});

describe("the derived views", () => {
  it("erases profiles, so the cascades actually fire", () => {
    expect(eraseTables().map((t) => t.table)).toContain("profiles");
  });

  it("exports the personalization loop a member would want to check", () => {
    const exported = exportTables().map((t) => t.table);
    expect(exported).toContain("taste_profiles");
    expect(exported).toContain("member_memory");
    expect(exported).toContain("interaction_events");
    expect(exported).toContain("consent_events");
  });

  it("never exports another member's blocks", () => {
    const blocks = PERSONAL_DATA.find((t) => t.table === "user_blocks")!;
    expect(blocks.export).toBe(false);
  });

  it("drops the embedding from the taste profile export", () => {
    const taste = PERSONAL_DATA.find((t) => t.table === "taste_profiles")!;
    expect(taste.select).toBeDefined();
    expect(taste.select).not.toContain("embedding");
  });
});
