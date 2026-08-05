import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * A small SQL reader for the migration directory, so a test can ask the schema
 * questions instead of trusting a hand-maintained list.
 *
 * Not a `.test.ts` file on purpose - vitest's `include` is
 * ["tests/**\/*.test.ts"], so this is a helper rather than a suite.
 *
 * It is deliberately not a full parser. It understands exactly the four things
 * personal-data.test.ts needs: which tables exist now, which were dropped
 * again, which columns point at a member, and what happens to those columns
 * when the member goes.
 */

export type ForeignKey = {
  column: string;
  /** "profiles", "posts", "auth.users", ... */
  references: string;
  onDelete: "cascade" | "set null" | "restrict";
};

export type ParsedTable = {
  name: string;
  foreignKeys: ForeignKey[];
};

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function migrationFiles(): string[] {
  // Zero-padded sequence prefixes, so lexicographic order is apply order.
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** `on delete cascade` / `on delete set null` / neither, from a column tail. */
function deleteRule(tail: string): ForeignKey["onDelete"] {
  const lowered = tail.toLowerCase();
  if (lowered.includes("on delete cascade")) return "cascade";
  if (lowered.includes("on delete set null")) return "set null";
  return "restrict";
}

const REFERENCE = /references\s+(?:public\.(\w+)|(auth)\.(\w+))\s*\(\s*\w+\s*\)/i;

function foreignKeysIn(body: string): ForeignKey[] {
  const keys: ForeignKey[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim().replace(/,$/, "");
    if (!REFERENCE.test(line)) continue;

    const columnMatch = /^(\w+)\s+/.exec(line);
    if (!columnMatch) continue;
    // "constraint foo check (...)" and similar are not column definitions.
    if (["constraint", "primary", "unique", "check"].includes(columnMatch[1])) {
      continue;
    }

    const ref = REFERENCE.exec(line);
    if (!ref) continue;
    keys.push({
      column: columnMatch[1],
      references: ref[1] ?? `${ref[2]}.${ref[3]}`,
      onDelete: deleteRule(line),
    });
  }
  return keys;
}

/**
 * Every table that exists after all migrations have run.
 *
 * Replays creates, drops and `alter table ... add column ... references` in
 * order. The drop handling is not theoretical: subscriptions, reels and
 * reel_jobs were all created and later dropped (migrations 44 and 45), and a
 * parser that ignored drops would demand they be classified as personal data.
 */
export function parseSchema(): Map<string, ParsedTable> {
  const tables = new Map<string, ParsedTable>();

  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    for (const match of sql.matchAll(
      /create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g,
    )) {
      const name = match[1];
      tables.set(name, { name, foreignKeys: foreignKeysIn(match[2]) });
    }

    for (const match of sql.matchAll(
      /drop table (?:if exists )?public\.(\w+)/g,
    )) {
      tables.delete(match[1]);
    }

    // `alter table public.X add column y uuid references public.profiles(id) ...`
    for (const match of sql.matchAll(
      /alter table (?:if exists )?public\.(\w+)([\s\S]*?);/g,
    )) {
      const table = tables.get(match[1]);
      if (!table) continue;
      for (const clause of match[2].split(/add column/i).slice(1)) {
        const line = clause.split("\n").join(" ").trim();
        if (!REFERENCE.test(line)) continue;
        const columnMatch = /^(?:if not exists\s+)?(\w+)\s+/i.exec(line);
        const ref = REFERENCE.exec(line);
        if (!columnMatch || !ref) continue;
        table.foreignKeys.push({
          column: columnMatch[1],
          references: ref[1] ?? `${ref[2]}.${ref[3]}`,
          onDelete: deleteRule(line),
        });
      }
    }
  }

  return tables;
}

/** Tables with a direct FK to profiles or auth.users. */
export function directlyUserKeyed(schema: Map<string, ParsedTable>): string[] {
  return [...schema.values()]
    .filter((t) =>
      t.foreignKeys.some(
        (fk) => fk.references === "profiles" || fk.references === "auth.users",
      ),
    )
    .map((t) => t.name)
    .sort();
}

/**
 * Tables reachable from a user-keyed table by one more FK hop.
 *
 * This is the level that catches post_media: it has no user column at all, it
 * belongs to a member only because its post does, and a scan that stopped at
 * direct FKs would happily declare the schema fully classified while the
 * post-media bucket kept leaking.
 */
export function indirectlyUserKeyed(schema: Map<string, ParsedTable>): string[] {
  const direct = new Set(directlyUserKeyed(schema));
  return [...schema.values()]
    .filter((t) => !direct.has(t.name))
    .filter((t) => t.foreignKeys.some((fk) => direct.has(fk.references)))
    .map((t) => t.name)
    .sort();
}
