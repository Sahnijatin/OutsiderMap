import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Migration 58 revokes UPDATE on public.profiles from `authenticated` and
 * grants back a named list of columns, so a member client cannot write its own
 * age_verified_at or clear its own blocked_at.
 *
 * The danger is that this fails at RUNTIME, not at typecheck: TypeScript is
 * perfectly happy with `.update({ curator_score: 5 })` on the member client,
 * and the first sign of trouble is a permission error in production. That is
 * exactly the kind of gap a manual smoke test is supposed to cover and
 * routinely doesn't, six months later, when someone adds a column.
 *
 * So this reads the grant list out of the migration, finds every
 * `.from("profiles").update({...})` in src/ that is NOT on an admin client,
 * and fails if any written column is not granted.
 */

const MIGRATION = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "00000000000058_age_gate.sql",
);

/** The columns migration 58 grants back to `authenticated`. */
function grantedColumns(): string[] {
  const sql = readFileSync(MIGRATION, "utf8");
  const match = /grant update \(([\s\S]*?)\)\s*on public\.profiles/.exec(sql);
  if (!match) throw new Error("could not find the profiles grant in migration 58");
  return match[1]
    .split(",")
    .map((c) => c.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

type Write = { file: string; columns: string[] };

/**
 * Every `.from("profiles").update({ ... })` in src/, with the columns it
 * writes. Files that import the service-role factory are skipped: the service
 * role is a different Postgres role and keeps its privileges.
 */
function memberProfileWrites(): Write[] {
  const writes: Write[] = [];
  for (const file of sourceFiles(path.join(process.cwd(), "src"))) {
    const source = readFileSync(file, "utf8");
    if (!source.includes('from("profiles")')) continue;
    // Conservative: one admin import exempts the file. A file that mixes both
    // clients would slip through, so if that ever happens this needs to get
    // smarter rather than the exemption getting broader.
    if (source.includes("createAdminClient")) continue;

    for (const match of source.matchAll(
      /from\("profiles"\)\s*\n?\s*\.update\(\{([\s\S]*?)\}\)/g,
    )) {
      const columns = [...match[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
      if (columns.length > 0) {
        writes.push({ file: path.relative(process.cwd(), file), columns });
      }
    }
  }
  return writes;
}

describe("the profiles column grant", () => {
  const granted = grantedColumns();

  it("parses out of migration 58", () => {
    expect(granted.length).toBeGreaterThan(0);
    expect(granted).toContain("bio");
    expect(granted).toContain("username");
  });

  it("does not grant the gate columns", () => {
    // The whole point: a member client must not be able to verify its own age
    // or unblock itself.
    for (const column of [
      "age_verified_at",
      "blocked_at",
      "blocked_reason",
      "date_of_birth",
      "policy_version_accepted",
      "is_admin",
      "personalization_enabled",
      "memory_enabled",
    ]) {
      expect(granted, `${column} must not be client-writable`).not.toContain(
        column,
      );
    }
  });

  it("finds the member-side writes it is meant to be checking", () => {
    // Guards the guard: a regex that silently matches nothing would make every
    // assertion below vacuously true.
    const writes = memberProfileWrites();
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.flatMap((w) => w.columns)).toContain("bio");
  });

  it("grants every column a member client actually writes", () => {
    for (const write of memberProfileWrites()) {
      for (const column of write.columns) {
        expect(
          granted,
          `${write.file} writes profiles.${column} through a member client, ` +
            `but migration 58 does not grant it - this fails at runtime, not here`,
        ).toContain(column);
      }
    }
  });
});
