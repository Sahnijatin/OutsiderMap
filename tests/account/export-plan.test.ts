import { describe, expect, it } from "vitest";
import {
  bundleFooter,
  bundleHeader,
  planExport,
  serializeTablePage,
} from "@/lib/account/export";
import { PERSONAL_DATA } from "@/lib/account/personal-data";

const SUBJECT = { userId: "u-1", email: "member@example.com" };

describe("planExport", () => {
  it("plans every exportable table and nothing else", () => {
    const plans = planExport(SUBJECT);
    const planned = plans.map((p) => p.table);
    for (const entry of PERSONAL_DATA) {
      if (entry.export) expect(planned).toContain(entry.table);
      else expect(planned).not.toContain(entry.table);
    }
  });

  it("filters a plain owner column", () => {
    const plan = planExport(SUBJECT).find((p) => p.table === "member_memory")!;
    expect(plan.filters).toEqual([{ column: "user_id", value: "u-1" }]);
    expect(plan.orFilter).toBeUndefined();
  });

  it("uses an or-filter for two-party rows", () => {
    // A follow is the subject's row whichever end they are on.
    const plan = planExport(SUBJECT).find((p) => p.table === "follows")!;
    expect(plan.orFilter).toBe("follower.eq.u-1,followee.eq.u-1");
    expect(plan.filters).toEqual([]);
  });

  it("describes the parent hop for via-tables", () => {
    const plan = planExport(SUBJECT).find((p) => p.table === "post_media")!;
    expect(plan.via).toEqual({
      parent: "posts",
      localColumn: "post_id",
      parentColumn: "author_id",
    });
  });

  it("matches the waitlist by email", () => {
    const plan = planExport(SUBJECT).find((p) => p.table === "waitlist")!;
    expect(plan.filters).toEqual([
      { column: "email", value: "member@example.com" },
    ]);
  });

  it("drops the waitlist entirely when there is no email to match on", () => {
    // Better than planning it and returning an empty section, which would
    // read as "we looked and you have none".
    const plans = planExport({ userId: "u-1", email: null });
    expect(plans.map((p) => p.table)).not.toContain("waitlist");
  });

  it("carries the column redaction into the plan", () => {
    const plan = planExport(SUBJECT).find((p) => p.table === "taste_profiles")!;
    expect(plan.select).not.toContain("embedding");
    expect(plan.select).toContain("taste_summary");
  });

  it("selects everything by default", () => {
    const plan = planExport(SUBJECT).find((p) => p.table === "member_memory")!;
    expect(plan.select).toBe("*");
  });

  it("applies the per-table limit, and a default elsewhere", () => {
    const plans = planExport(SUBJECT);
    expect(plans.find((p) => p.table === "interaction_events")!.limit).toBe(50_000);
    expect(plans.find((p) => p.table === "member_memory")!.limit).toBe(10_000);
  });

  it("honours a registry passed in, so the shape is testable in isolation", () => {
    expect(planExport(SUBJECT, [])).toEqual([]);
  });

  it("exports only the subject's own blocks, not blocks against them", () => {
    // Erasure removes both directions; the export must not hand back who
    // blocked THEM, which would turn a safety feature into a targeting list.
    const plan = planExport(SUBJECT).find((p) => p.table === "user_blocks")!;
    expect(plan.filters).toEqual([{ column: "blocker", value: "u-1" }]);
    expect(plan.orFilter).toBeUndefined();
  });

  it("still erases user_blocks on both sides", () => {
    const entry = PERSONAL_DATA.find((t) => t.table === "user_blocks")!;
    expect(entry.key).toEqual({
      by: "columns",
      columns: ["blocker", "blocked"],
    });
  });

  it("returns usernames rather than another member's uuid", () => {
    // A raw uuid is useless to the subject and is someone else's internal id.
    for (const table of ["follows", "activity_events", "user_blocks"]) {
      const plan = planExport(SUBJECT).find((p) => p.table === table)!;
      expect(plan.select, `${table} exports raw uuids`).not.toBe("*");
      expect(plan.select).toContain("username");
    }
  });
});

describe("the streamed document", () => {
  const meta = {
    generatedAt: "2026-08-05T10:00:00.000Z",
    policyVersion: "2026-08-05",
    subject: SUBJECT,
  };

  it("assembles into valid JSON", () => {
    // The route streams these three pieces without ever holding the whole
    // bundle in memory, so the only thing worth testing is that they join up.
    const body =
      bundleHeader(meta) +
      serializeTablePage("member_memory", [{ id: "m-1", text: "vegetarian" }], true) +
      serializeTablePage("saved_places", [], false) +
      bundleFooter({ truncated: [], processing: { purposes: [] } });

    const parsed = JSON.parse(body);
    expect(parsed.export_version).toBe(1);
    expect(parsed.policy_version).toBe("2026-08-05");
    expect(parsed.subject).toEqual({
      user_id: "u-1",
      email: "member@example.com",
    });
    expect(parsed.tables.member_memory).toHaveLength(1);
    expect(parsed.tables.saved_places).toEqual([]);
  });

  it("stays valid JSON with no tables at all", () => {
    const body =
      bundleHeader(meta) + bundleFooter({ truncated: [], processing: {} });
    expect(() => JSON.parse(body)).not.toThrow();
  });

  it("reports what it cut short", () => {
    const body =
      bundleHeader(meta) +
      serializeTablePage("interaction_events", [], true) +
      bundleFooter({
        truncated: [
          { table: "interaction_events", exported: 50_000, limit: 50_000 },
        ],
        processing: {},
      });
    const parsed = JSON.parse(body);
    expect(parsed.notes.truncated).toEqual([
      { table: "interaction_events", exported: 50_000, limit: 50_000 },
    ]);
  });

  it("names what survives erasure, and why", () => {
    const body =
      bundleHeader(meta) + bundleFooter({ truncated: [], processing: {} });
    const parsed = JSON.parse(body);
    const grievances = parsed.notes.retained.find(
      (r: { table: string }) => r.table === "grievances",
    );
    expect(grievances.reason).toContain("IT Rules");
  });

  it("admits which columns it left out", () => {
    const body =
      bundleHeader(meta) + bundleFooter({ truncated: [], processing: {} });
    const parsed = JSON.parse(body);
    const taste = parsed.notes.omitted_columns.find(
      (o: { table: string }) => o.table === "taste_profiles",
    );
    expect(taste).toBeDefined();
  });

  it("carries the processing summary §11 actually asks for", () => {
    const processing = { purposes: [{ purpose: "personalization" }] };
    const body =
      bundleHeader(meta) + bundleFooter({ truncated: [], processing });
    expect(JSON.parse(body).processing).toEqual(processing);
  });
});
