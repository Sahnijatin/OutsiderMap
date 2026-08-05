import {
  PERSONAL_DATA,
  exportLimitFor,
  exportTables,
  retainedTables,
  subjectFilters,
  type PersonalTable,
  type Subject,
  type TableName,
} from "./personal-data";

/**
 * DPDP §11: the right of access.
 *
 * Erasure shipped; the read side never did. A member could destroy their data
 * but not see it, which is the wrong half of the pair to build first - you
 * cannot check that a deletion was complete if you were never able to look.
 *
 * The planner and the serializer live here, pure and testable. The route is a
 * loop around a stream controller, which is not - and per the house convention
 * (no API-route tests anywhere in this repo) that is exactly the seam: all the
 * decisions are in this file, none of the plumbing is.
 */

export type FetchPlan = {
  table: TableName;
  label: string;
  select: string;
  limit: number;
  /** ANDed filters. Empty when the plan resolves through a parent. */
  filters: { column: string; value: string }[];
  /** PostgREST `.or()` argument for two-party tables. */
  orFilter?: string;
  /** Set when rows are reached via a parent table (post_media -> posts). */
  via?: { parent: TableName; localColumn: string; parentColumn: string };
};

/**
 * One plan per exportable table, in registry order.
 *
 * Tables the subject cannot match at all (waitlist with no email) are dropped
 * rather than planned-and-skipped, so the bundle never carries an empty
 * section implying we looked and found nothing when we could not look.
 */
export function planExport(
  subject: Subject,
  registry: readonly PersonalTable[] = PERSONAL_DATA,
): FetchPlan[] {
  const plans: FetchPlan[] = [];

  for (const entry of registry.filter((t) => t.export)) {
    const base = {
      table: entry.table,
      label: entry.label,
      select: entry.select ?? "*",
      limit: exportLimitFor(entry),
    };

    if (entry.key.by === "via") {
      plans.push({
        ...base,
        filters: [],
        via: {
          parent: entry.key.parent,
          localColumn: entry.key.localColumn,
          parentColumn: entry.key.parentColumn,
        },
      });
      continue;
    }

    if (entry.key.by === "columns") {
      plans.push({
        ...base,
        filters: [],
        // Either side of a two-party row is the subject's row.
        orFilter: entry.key.columns
          .map((column) => `${column}.eq.${subject.userId}`)
          .join(","),
      });
      continue;
    }

    const filters = subjectFilters(entry, subject);
    if (!filters) continue;
    plans.push({ ...base, filters });
  }

  return plans;
}

export type BundleMeta = {
  generatedAt: string;
  policyVersion: string;
  subject: Subject;
};

export type TruncationNote = {
  table: TableName;
  exported: number;
  limit: number;
};

export type BundleNotes = {
  truncated: TruncationNote[];
  /**
   * The §11 "summary of processing" - purposes, consent history, processors
   * and retention. Built from the same constants the app enforces, so the
   * summary is a description of the system rather than a second document that
   * can quietly disagree with it.
   */
  processing: unknown;
};

/** Opens the JSON document. The route streams sections into it. */
export function bundleHeader(meta: BundleMeta): string {
  return (
    "{\n" +
    '  "export_version": 1,\n' +
    `  "generated_at": ${JSON.stringify(meta.generatedAt)},\n` +
    `  "policy_version": ${JSON.stringify(meta.policyVersion)},\n` +
    `  "subject": ${JSON.stringify({
      user_id: meta.subject.userId,
      email: meta.subject.email,
    })},\n` +
    '  "tables": {\n'
  );
}

/**
 * One table's page of rows. `first` controls the comma, so the caller never
 * has to buffer the whole document to know whether a separator is needed.
 */
export function serializeTablePage(
  table: string,
  rows: unknown[],
  first: boolean,
): string {
  const prefix = first ? "" : ",\n";
  return `${prefix}    ${JSON.stringify(table)}: ${JSON.stringify(rows)}`;
}

/**
 * Closes the document with the honest footnotes: what was cut short, what
 * survives deletion and why, and which columns we chose not to include.
 */
export function bundleFooter(notes: BundleNotes): string {
  const retained = retainedTables().map((t) => ({
    table: t.table,
    label: t.label,
    reason: t.retainReason ?? "",
  }));
  const omitted = exportTables()
    .filter((t) => t.select)
    .map((t) => ({ table: t.table, select: t.select }));

  return (
    "\n  },\n" +
    `  "notes": ${JSON.stringify(
      {
        retained,
        truncated: notes.truncated,
        omitted_columns: omitted,
      },
      null,
      2,
    )
      .split("\n")
      .join("\n  ")},\n` +
    `  "processing": ${JSON.stringify(notes.processing, null, 2)
      .split("\n")
      .join("\n  ")}\n` +
    "}\n"
  );
}
