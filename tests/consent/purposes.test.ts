import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PURPOSES,
  PURPOSE_BY_KEY,
  isGranted,
  purgeTargets,
  withdrawablePurposes,
  type ConsentPurpose,
} from "@/lib/consent/purposes";

const MIGRATION = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "00000000000057_consent_records.sql",
);

describe("the purpose list matches the database", () => {
  it("has exactly the purposes the check constraint allows", () => {
    // The TS union and the SQL check constraint are two declarations of one
    // fact. If they drift, record_consent starts raising at runtime on a
    // purpose the UI happily offers - so diff them here instead.
    const sql = readFileSync(MIGRATION, "utf8");
    const match = /purpose text not null check \(purpose in \(([\s\S]*?)\)\)/.exec(
      sql,
    );
    expect(match, "could not find the purpose check constraint").not.toBeNull();

    const inSql = [...match![1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    const inTs = PURPOSES.map((p) => p.purpose).sort();
    expect(inSql).toEqual(inTs);
  });
});

describe("the purposes are itemized the way DPDP requires", () => {
  it("makes only the essential purpose mandatory", () => {
    // §6: consent must be unconditional and specific. Anything beyond running
    // the service has to be independently refusable, or the notice is a
    // take-it-or-leave-it bundle.
    const required = PURPOSES.filter((p) => p.required).map((p) => p.purpose);
    expect(required).toEqual(["essential"]);
  });

  it("offers every other purpose as withdrawable", () => {
    expect(withdrawablePurposes()).toHaveLength(PURPOSES.length - 1);
    expect(withdrawablePurposes().map((p) => p.purpose)).not.toContain(
      "essential",
    );
  });

  it("describes every purpose, because an undescribed one is not informed", () => {
    for (const purpose of PURPOSES) {
      expect(purpose.label.trim()).toBeTruthy();
      expect(purpose.description.trim().length).toBeGreaterThan(40);
    }
  });

  it("says what withdrawal destroys, for the purposes that destroy something", () => {
    expect(PURPOSE_BY_KEY.personalization.dataTouched.length).toBeGreaterThan(0);
    expect(PURPOSE_BY_KEY.member_memory.dataTouched.length).toBeGreaterThan(0);
  });

  it("indexes every purpose by key", () => {
    for (const purpose of PURPOSES) {
      expect(PURPOSE_BY_KEY[purpose.purpose]).toBe(purpose);
    }
  });
});

describe("isGranted", () => {
  it("fails closed when there is no row at all", () => {
    // A brand-new account, and any purpose the migration-57 backfill did not
    // cover. Silence is not consent.
    expect(isGranted({}, "personalization")).toBe(false);
  });

  it("is false for an explicit withdrawal", () => {
    expect(isGranted({ personalization: false }, "personalization")).toBe(false);
  });

  it("is true only for an explicit grant", () => {
    expect(isGranted({ personalization: true }, "personalization")).toBe(true);
  });

  it("does not leak one purpose's answer to another", () => {
    const map = { personalization: true };
    expect(isGranted(map, "member_memory")).toBe(false);
  });
});

describe("purgeTargets", () => {
  it("takes member memory down with personalization", () => {
    // Remembered facts exist only to personalize, so keeping them after
    // "stop personalizing" would be a distinction without a difference.
    expect(purgeTargets("personalization")).toEqual([
      "taste_derived",
      "member_memory",
      "interaction_events",
    ]);
  });

  it("scopes a member_memory withdrawal to memory alone", () => {
    expect(purgeTargets("member_memory")).toEqual(["member_memory"]);
  });

  it("destroys nothing for purposes with no derived data", () => {
    const noop: ConsentPurpose[] = ["essential", "notifications", "location"];
    for (const purpose of noop) {
      expect(purgeTargets(purpose)).toEqual([]);
    }
  });
});
