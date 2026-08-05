import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { eraseSubject } from "@/lib/account/erase";
import { eraseTables, storageTargets } from "@/lib/account/personal-data";

/**
 * Erasure. The ordering is the contract - storage objects have to be collected
 * while the rows that point at them still exist, and profiles has to go last
 * so its cascades do not remove rows mid-sweep. Both are pinned here, because
 * getting either wrong leaves data behind while reporting success.
 */

type Step =
  | { kind: "select"; table: string }
  | { kind: "delete"; table: string }
  | { kind: "storage"; bucket: string; paths: string[] }
  | { kind: "authDelete" }
  | { kind: "log"; payload: Record<string, unknown> };

function fakeAdmin(options: { failDelete?: string; rows?: Record<string, unknown[]> } = {}) {
  const steps: Step[] = [];
  const rows = options.rows ?? {};

  const builder = (table: string) => {
    const self = {
      select() {
        steps.push({ kind: "select", table });
        const chain = {
          eq: () => chain,
          in: () => chain,
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: rows[table] ?? [], error: null }),
        };
        return chain;
      },
      delete() {
        const chain = {
          eq: () => chain,
          or: () => chain,
          then: (resolve: (v: unknown) => unknown) => {
            steps.push({ kind: "delete", table });
            return resolve(
              options.failDelete === table
                ? { error: { message: "delete failed" } }
                : { error: null },
            );
          },
        };
        return chain;
      },
      insert(payload: Record<string, unknown>) {
        steps.push({ kind: "log", payload });
        return Promise.resolve({ error: null });
      },
    };
    return self;
  };

  const admin = {
    from: builder,
    storage: {
      from(bucket: string) {
        return {
          remove: async (paths: string[]) => {
            steps.push({ kind: "storage", bucket, paths });
            return { error: null };
          },
        };
      },
    },
    auth: {
      admin: {
        deleteUser: async () => {
          steps.push({ kind: "authDelete" });
          return { error: null };
        },
      },
    },
  } as unknown as SupabaseClient<Database>;

  return { admin, steps };
}

const SUBJECT = { userId: "u-1", email: "member@example.com" };

describe("eraseSubject", () => {
  it("deletes every table the registry marks explicit", async () => {
    const { admin, steps } = fakeAdmin();
    await eraseSubject(admin, SUBJECT);

    const deleted = steps
      .filter((s): s is { kind: "delete"; table: string } => s.kind === "delete")
      .map((s) => s.table);

    for (const entry of eraseTables()) {
      expect(deleted, `${entry.table} was never deleted`).toContain(entry.table);
    }
  });

  it("deletes each table exactly once", async () => {
    const { admin, steps } = fakeAdmin();
    await eraseSubject(admin, SUBJECT);
    const deleted = steps
      .filter((s) => s.kind === "delete")
      .map((s) => (s as { table: string }).table);
    expect(new Set(deleted).size).toBe(deleted.length);
  });

  it("removes storage objects before deleting any rows", async () => {
    // The pointers live on the rows. Delete the rows first and the objects are
    // unreachable forever - which is exactly what happened to post-media
    // before the registry existed.
    const { admin, steps } = fakeAdmin({
      rows: {
        quest_stop_media: [{ storage_path: "u-1/a.jpg" }],
        posts: [{ id: "p-1" }],
        post_media: [{ path: "u-1/post.jpg" }],
        waitlist: [{ selfie_path: "u-1/selfie.jpg", photo_paths: ["u-1/1.jpg"] }],
      },
    });
    await eraseSubject(admin, SUBJECT);

    const firstStorage = steps.findIndex((s) => s.kind === "storage");
    const firstDelete = steps.findIndex((s) => s.kind === "delete");
    expect(firstStorage).toBeGreaterThanOrEqual(0);
    expect(firstStorage).toBeLessThan(firstDelete);
  });

  it("collects post media through its parent post", async () => {
    const { admin, steps } = fakeAdmin({
      rows: { posts: [{ id: "p-1" }], post_media: [{ path: "u-1/post.jpg" }] },
    });
    await eraseSubject(admin, SUBJECT);

    const removed = steps.filter(
      (s): s is { kind: "storage"; bucket: string; paths: string[] } =>
        s.kind === "storage",
    );
    expect(removed.flatMap((s) => s.paths)).toContain("u-1/post.jpg");
  });

  it("flattens array path columns, like the waitlist photo set", async () => {
    const { admin, steps } = fakeAdmin({
      rows: {
        waitlist: [
          { selfie_path: "u-1/selfie.jpg", photo_paths: ["u-1/a.jpg", "u-1/b.jpg"] },
        ],
      },
    });
    await eraseSubject(admin, SUBJECT);

    const paths = steps
      .filter((s): s is { kind: "storage"; bucket: string; paths: string[] } =>
        s.kind === "storage",
      )
      .flatMap((s) => s.paths);
    expect(paths).toEqual(
      expect.arrayContaining(["u-1/selfie.jpg", "u-1/a.jpg", "u-1/b.jpg"]),
    );
  });

  it("deletes the profile after the tables and the auth user after that", async () => {
    const { admin, steps } = fakeAdmin();
    await eraseSubject(admin, SUBJECT);

    const profileAt = steps.findIndex(
      (s) => s.kind === "delete" && (s as { table: string }).table === "profiles",
    );
    const otherDeletes = steps
      .map((s, i) => ({ s, i }))
      .filter(
        ({ s }) =>
          s.kind === "delete" && (s as { table: string }).table !== "profiles",
      )
      .map(({ i }) => i);

    expect(profileAt).toBeGreaterThan(Math.max(...otherDeletes));
    expect(steps.findIndex((s) => s.kind === "authDelete")).toBeGreaterThan(
      profileAt,
    );
  });

  it("writes the erasure record last", async () => {
    const { admin, steps } = fakeAdmin();
    await eraseSubject(admin, SUBJECT);
    expect(steps[steps.length - 1].kind).toBe("log");
  });

  it("keeps going after one table fails, and reports it", async () => {
    const { admin, steps } = fakeAdmin({ failDelete: "member_memory" });
    const result = await eraseSubject(admin, SUBJECT);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("member_memory");
    // The rest of the sweep still ran.
    const deleted = steps
      .filter((s) => s.kind === "delete")
      .map((s) => (s as { table: string }).table);
    expect(deleted).toContain("profiles");
    expect(steps.some((s) => s.kind === "authDelete")).toBe(true);
  });

  it("can be told to leave the auth user alone", async () => {
    const { admin, steps } = fakeAdmin();
    await eraseSubject(admin, SUBJECT, { deleteAuthUser: false });
    expect(steps.some((s) => s.kind === "authDelete")).toBe(false);
  });

  it("skips the waitlist for a subject with no email", async () => {
    const { admin, steps } = fakeAdmin();
    await eraseSubject(admin, { userId: "u-1", email: null });
    const deleted = steps
      .filter((s) => s.kind === "delete")
      .map((s) => (s as { table: string }).table);
    expect(deleted).not.toContain("waitlist");
  });

  it("touches every storage bucket the registry declares", async () => {
    const rows: Record<string, unknown[]> = { posts: [{ id: "p-1" }] };
    for (const entry of storageTargets()) {
      rows[entry.table as string] = [
        { [entry.storage!.pathColumn]: `u-1/${entry.table}.jpg` },
      ];
    }
    const { admin, steps } = fakeAdmin({ rows });
    await eraseSubject(admin, SUBJECT);

    const buckets = new Set(
      steps
        .filter((s): s is { kind: "storage"; bucket: string; paths: string[] } =>
          s.kind === "storage",
        )
        .map((s) => s.bucket),
    );
    for (const entry of storageTargets()) {
      expect(buckets, `${entry.storage!.bucket} was never purged`).toContain(
        entry.storage!.bucket,
      );
    }
  });
});
