import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  eraseTables,
  storageTargets,
  subjectFilters,
  type PersonalTable,
  type Subject,
} from "./personal-data";

/**
 * DPDP right to erasure, driven by the shared registry.
 *
 * The behaviour that was already right is kept: every step runs even if an
 * earlier one fails, failures are accumulated, and the caller reports a
 * partial purge rather than showing "deleted" over a half-finished job. What
 * changes is where the list comes from - personal-data.ts instead of a literal
 * array that had drifted from the schema by about twenty tables.
 *
 * Takes the client as an argument rather than importing the admin factory, so
 * the ordering contract below can be tested against a hand-rolled fake.
 */

type Admin = SupabaseClient<Database>;

export type EraseResult = {
  purged: string[];
  errors: string[];
};

/** Paths from one storage-bearing table, flattened across single + array columns. */
async function collectStoragePaths(
  admin: Admin,
  entry: PersonalTable,
  subject: Subject,
  errors: string[],
): Promise<string[]> {
  const storage = entry.storage;
  if (!storage) return [];

  const filters = subjectFilters(entry, subject);
  if (!filters) return [];

  const columns = [storage.pathColumn, storage.arrayColumn]
    .filter((c): c is string => Boolean(c))
    .join(", ");

  // Two-party and via-parent tables never carry storage today; if one ever
  // does, it needs its own branch rather than a silently wrong filter.
  let query = admin.from(entry.table).select(columns);
  for (const filter of filters) {
    query = query.eq(filter.column, filter.value);
  }

  const { data, error } = await query;
  if (error) {
    errors.push(`${entry.table} storage paths: ${error.message}`);
    return [];
  }

  const paths: string[] = [];
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const single = row[storage.pathColumn];
    if (typeof single === "string" && single) paths.push(single);
    if (storage.arrayColumn) {
      const many = row[storage.arrayColumn];
      if (Array.isArray(many)) {
        for (const p of many) if (typeof p === "string" && p) paths.push(p);
      }
    }
  }
  return paths;
}

/**
 * Storage paths reachable only through a parent - post_media rows belong to
 * the subject because their post does. These were orphaned on every deletion
 * before this registry existed: the rows cascaded away and took the pointers
 * with them, leaving the objects in the bucket forever.
 */
async function collectViaStoragePaths(
  admin: Admin,
  entry: PersonalTable,
  subject: Subject,
  errors: string[],
): Promise<string[]> {
  if (!entry.storage || entry.key.by !== "via") return [];
  const { parent, localColumn, parentColumn } = entry.key;

  const { data: parents, error: parentError } = await admin
    .from(parent)
    .select("id")
    .eq(parentColumn, subject.userId);
  if (parentError) {
    errors.push(`${entry.table} parent lookup: ${parentError.message}`);
    return [];
  }
  const parentIds = (parents ?? []).map(
    (p) => (p as unknown as { id: string }).id,
  );
  if (parentIds.length === 0) return [];

  const { data, error } = await admin
    .from(entry.table)
    .select(entry.storage.pathColumn)
    .in(localColumn, parentIds);
  if (error) {
    errors.push(`${entry.table} storage paths: ${error.message}`);
    return [];
  }

  const paths: string[] = [];
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const value = row[entry.storage.pathColumn];
    if (typeof value === "string" && value) paths.push(value);
  }
  return paths;
}

/**
 * Erase everything belonging to one subject.
 *
 * Order is the contract:
 *   1. storage objects  (pointers still exist)
 *   2. explicit tables  (registry order)
 *   3. profiles         (cascades the rest)
 *   4. the auth user    (so the account cannot sign back in)
 *   5. erasure_log      (proof it happened)
 */
export async function eraseSubject(
  admin: Admin,
  subject: Subject,
  opts: { deleteAuthUser?: boolean; method?: "self_serve" | "admin" } = {},
): Promise<EraseResult> {
  const { deleteAuthUser = true, method = "self_serve" } = opts;
  const purged: string[] = [];
  const errors: string[] = [];

  // 1. Storage first, while the rows that point at the objects still exist.
  const byBucket = new Map<string, string[]>();
  for (const entry of storageTargets()) {
    const paths =
      entry.key.by === "via"
        ? await collectViaStoragePaths(admin, entry, subject, errors)
        : await collectStoragePaths(admin, entry, subject, errors);
    if (paths.length === 0) continue;
    const bucket = entry.storage!.bucket;
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), ...paths]);
  }
  for (const [bucket, paths] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) errors.push(`${bucket}: ${error.message}`);
    else purged.push(`${bucket} (${paths.length})`);
  }

  // 2. Explicit tables, minus profiles - that one goes last so its cascades
  //    do not remove rows we still want to report on.
  for (const entry of eraseTables()) {
    if (entry.table === "profiles") continue;

    const filters = subjectFilters(entry, subject);
    if (!filters) continue;

    let query = admin.from(entry.table).delete();
    if (entry.key.by === "columns") {
      query = query.or(
        filters.map((f) => `${f.column}.eq.${f.value}`).join(","),
      );
    } else {
      for (const filter of filters) query = query.eq(filter.column, filter.value);
    }

    const { error } = await query;
    if (error) errors.push(`${entry.table}: ${error.message}`);
    else purged.push(entry.table);
  }

  // 3. profiles - everything marked "cascade" in the registry goes with it.
  const { error: profileError } = await admin
    .from("profiles")
    .delete()
    .eq("id", subject.userId);
  if (profileError) errors.push(`profiles: ${profileError.message}`);
  else purged.push("profiles");

  // 4. The auth user itself.
  if (deleteAuthUser) {
    const { error } = await admin.auth.admin.deleteUser(subject.userId);
    if (error) errors.push(`auth user: ${error.message}`);
  }

  // 5. The record that this happened. Best-effort: failing to log an erasure
  //    must not turn a completed erasure into a reported failure.
  const { error: logError } = await admin.from("erasure_log").insert({
    user_id: subject.userId,
    method,
    tables_purged: purged.length,
    errors: errors.length,
  });
  if (logError) {
    console.error("erasure_log write failed", {
      user_id: subject.userId,
      message: logError.message,
    });
  }

  return { purged, errors };
}
