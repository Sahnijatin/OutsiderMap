import { describe, expect, it } from "vitest";
import {
  RETENTION_RULES,
  TOTAL_ROW_BUDGET,
  UNDERAGE_RECORD_DAYS,
  planRetention,
  underageCutoffISO,
  type RetentionRule,
} from "@/lib/account/retention";
import { parseSchema } from "./migration-schema";

const NOW = Date.parse("2026-08-05T22:00:00.000Z");
const DAY = 86_400_000;

describe("planRetention", () => {
  it("dates each rule from its own window", () => {
    const rules: RetentionRule[] = [
      {
        table: "interaction_events",
        column: "created_at",
        days: 400,
        batch: 100,
        label: "x",
        reason: "y",
      },
    ];
    const [step] = planRetention(NOW, rules);
    expect(step.cutoffISO).toBe(new Date(NOW - 400 * DAY).toISOString());
    expect(step.table).toBe("interaction_events");
    expect(step.batch).toBe(100);
  });

  it("uses now itself for a days:0 rule", () => {
    // member_memory ages on expires_at, which is already a deadline - the
    // cutoff is the present moment, not a window before it.
    const rules: RetentionRule[] = [
      {
        table: "member_memory",
        column: "expires_at",
        days: 0,
        batch: 10,
        label: "x",
        reason: "y",
      },
    ];
    expect(planRetention(NOW, rules)[0].cutoffISO).toBe(
      new Date(NOW).toISOString(),
    );
  });

  it("carries where clauses through to the step", () => {
    const rules: RetentionRule[] = [
      {
        table: "moderation_cases",
        column: "updated_at",
        days: 1095,
        where: { status: "closed" },
        batch: 10,
        label: "x",
        reason: "y",
      },
    ];
    expect(planRetention(NOW, rules)[0].where).toEqual({ status: "closed" });
  });

  it("stops once the budget is spent, dropping whole rules", () => {
    const rules: RetentionRule[] = [
      { table: "interaction_events", column: "created_at", days: 1, batch: 400, label: "a", reason: "" },
      { table: "chat_messages", column: "created_at", days: 1, batch: 400, label: "b", reason: "" },
      { table: "activity_events", column: "created_at", days: 1, batch: 400, label: "c", reason: "" },
    ];
    const steps = planRetention(NOW, rules, 900);
    expect(steps.map((s) => s.table)).toEqual([
      "interaction_events",
      "chat_messages",
    ]);
  });

  it("never plans more rows than the budget allows", () => {
    const steps = planRetention(NOW);
    const planned = steps.reduce((sum, s) => sum + s.batch, 0);
    expect(planned).toBeLessThanOrEqual(TOTAL_ROW_BUDGET);
  });

  it("keeps rule order stable, so the run log reads the same each day", () => {
    expect(planRetention(NOW).map((s) => s.table)).toEqual(
      planRetention(NOW + DAY).map((s) => s.table),
    );
  });
});

describe("the shipped rules match the actual schema", () => {
  // This suite exists because two rules shipped pointing at columns that do
  // not exist: notification_sends.created_at (it is sent_at) and
  // moderation_cases.updated_at + status (they are resolved_at and decision).
  //
  // Neither would have thrown. The sweep collects per-table errors and carries
  // on, so both rules would have failed silently every night while /privacy -
  // which renders its retention table from this very list - promised members
  // the deletions were happening. A retention policy nobody can see failing is
  // worse than no retention policy, because it is also a false statement.
  const schema = parseSchema();

  it("names tables that exist", () => {
    for (const rule of RETENTION_RULES) {
      expect(
        schema.has(rule.table as string),
        `${rule.table} is swept but is not in the schema`,
      ).toBe(true);
    }
  });

  it("ages on a column that exists", () => {
    for (const rule of RETENTION_RULES) {
      const columns = schema.get(rule.table as string)?.columns ?? [];
      expect(
        columns,
        `${rule.table}.${rule.column} does not exist - the sweep would fail silently every night`,
      ).toContain(rule.column);
    }
  });

  it("filters on columns that exist", () => {
    for (const rule of RETENTION_RULES) {
      const columns = schema.get(rule.table as string)?.columns ?? [];
      for (const column of Object.keys(rule.where ?? {})) {
        expect(
          columns,
          `${rule.table}.${column} is used as a retention filter but does not exist`,
        ).toContain(column);
      }
    }
  });

  it("deletes by an id column, which is how the batch bound works", () => {
    // runStep selects `id` then deletes by id - PostgREST has no
    // `delete ... limit`, so a table without `id` would blow past its batch.
    for (const rule of RETENTION_RULES) {
      const columns = schema.get(rule.table as string)?.columns ?? [];
      expect(columns, `${rule.table} has no id column`).toContain("id");
    }
  });
});

describe("the shipped rules", () => {
  it("never sweeps the record of lawful basis", () => {
    // Deleting the proof that consent was given would defeat the point of
    // collecting it. These die with the account, never on a timer.
    const swept = RETENTION_RULES.map((r) => r.table as string);
    expect(swept).not.toContain("consents");
    expect(swept).not.toContain("consent_events");
    expect(swept).not.toContain("erasure_log");
  });

  it("never sweeps things the member made", () => {
    const swept = RETENTION_RULES.map((r) => r.table as string);
    for (const table of ["posts", "saved_places", "quests", "weekend_plans", "taste_profiles"]) {
      expect(swept, `${table} is the member's to delete, not ours to expire`)
        .not.toContain(table);
    }
  });

  it("gives every rule member-readable wording, because /privacy renders it", () => {
    for (const rule of RETENTION_RULES) {
      expect(rule.label.trim(), `${rule.table} has no label`).toBeTruthy();
      expect(
        rule.reason.trim().length,
        `${rule.table} has no reason a member could read`,
      ).toBeGreaterThan(20);
    }
  });

  it("bounds every rule", () => {
    for (const rule of RETENTION_RULES) {
      expect(rule.batch).toBeGreaterThan(0);
      expect(rule.batch).toBeLessThanOrEqual(500);
      expect(rule.days).toBeGreaterThanOrEqual(0);
    }
  });

  it("lists no table twice", () => {
    const tables = RETENTION_RULES.map((r) => r.table);
    expect(new Set(tables).size).toBe(tables.length);
  });
});

describe("underageCutoffISO", () => {
  it("is 30 days back, which is what makes 'block, don't delete' honest", () => {
    expect(UNDERAGE_RECORD_DAYS).toBe(30);
    expect(underageCutoffISO(NOW)).toBe(
      new Date(NOW - 30 * DAY).toISOString(),
    );
  });
});
