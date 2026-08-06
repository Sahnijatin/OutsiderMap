import { describe, expect, it } from "vitest";
import {
  ageInYears,
  isAdult,
  maxAdultBirthDate,
  parseDob,
  verifyDateOfBirth,
} from "@/lib/consent/age";

/**
 * The age gate is the single biggest DPDP gap this change closes, and every
 * interesting case is a boundary. Time is passed in rather than mocked, the
 * same as tests/moderation/sla.test.ts.
 */

const at = (iso: string) => Date.parse(iso);

describe("parseDob", () => {
  it("accepts a padded ISO date", () => {
    expect(parseDob("2000-01-31")).toEqual({ y: 2000, m: 1, d: 31 });
  });

  it("trims surrounding whitespace", () => {
    expect(parseDob("  2000-01-31 ")).toEqual({ y: 2000, m: 1, d: 31 });
  });

  it("rejects unpadded months rather than guessing", () => {
    expect(parseDob("2008-2-9")).toBeNull();
  });

  it("rejects dates that do not exist", () => {
    expect(parseDob("2023-02-29")).toBeNull(); // 2023 is not a leap year
    expect(parseDob("2023-04-31")).toBeNull();
    expect(parseDob("2023-13-01")).toBeNull();
    expect(parseDob("2023-00-10")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(parseDob("2008-02-29")).toEqual({ y: 2008, m: 2, d: 29 });
  });

  it("rejects junk", () => {
    expect(parseDob("")).toBeNull();
    expect(parseDob("yesterday")).toBeNull();
    expect(parseDob("01/31/2000")).toBeNull();
  });
});

describe("ageInYears", () => {
  it("does not count a birthday that has not happened yet", () => {
    expect(ageInYears("2008-06-15", at("2026-06-14T12:00:00Z"))).toBe(17);
  });

  it("counts it on the day", () => {
    expect(ageInYears("2008-06-15", at("2026-06-15T00:00:00Z"))).toBe(18);
  });

  it("counts it after", () => {
    expect(ageInYears("2008-06-15", at("2026-06-16T00:00:00Z"))).toBe(18);
  });

  it("handles a birthday later in the same month", () => {
    expect(ageInYears("2008-06-20", at("2026-06-15T00:00:00Z"))).toBe(17);
  });

  it("handles a leap-day birthday without a special case", () => {
    // Born 29 Feb 2008. In 2026 (not a leap year) there is no 29 February,
    // so the 18th birthday falls on 1 March by the tuple rule.
    expect(ageInYears("2008-02-29", at("2026-02-28T23:00:00Z"))).toBe(17);
    expect(ageInYears("2008-02-29", at("2026-03-01T00:00:00Z"))).toBe(18);
  });

  it("returns null for an unparseable date", () => {
    expect(ageInYears("nope", at("2026-06-15T00:00:00Z"))).toBeNull();
  });

  it("goes negative for a future date", () => {
    expect(ageInYears("2030-01-01", at("2026-06-15T00:00:00Z"))).toBeLessThan(0);
  });
});

describe("isAdult", () => {
  const now = at("2026-08-05T10:00:00Z");

  it("is false the day before the 18th birthday", () => {
    expect(isAdult("2008-08-06", now)).toBe(false);
  });

  it("is true on the 18th birthday", () => {
    expect(isAdult("2008-08-05", now)).toBe(true);
  });

  it("is false for unparseable input, not permissive", () => {
    expect(isAdult("", now)).toBe(false);
  });

  it("respects a custom minimum", () => {
    expect(isAdult("2005-08-05", now, 21)).toBe(true);
    expect(isAdult("2006-08-05", now, 21)).toBe(false);
  });
});

describe("verifyDateOfBirth", () => {
  const now = at("2026-08-05T10:00:00Z");

  it("passes an adult and reports the age", () => {
    expect(verifyDateOfBirth("1990-01-01", now)).toEqual({ ok: true, age: 36 });
  });

  it("calls a future date a typo, not a claim of being unborn", () => {
    const verdict = verifyDateOfBirth("2030-01-01", now);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: "future" });
  });

  it("rejects an implausible age", () => {
    expect(verifyDateOfBirth("1850-01-01", now)).toMatchObject({
      ok: false,
      reason: "implausible",
    });
  });

  it("rejects a minor", () => {
    expect(verifyDateOfBirth("2010-01-01", now)).toMatchObject({
      ok: false,
      reason: "underage",
      age: 16,
    });
  });

  it("rejects malformed input before anything else", () => {
    expect(verifyDateOfBirth("2008-2-9", now)).toMatchObject({
      ok: false,
      reason: "malformed",
      age: null,
    });
  });
});

describe("maxAdultBirthDate", () => {
  it("is exactly 18 years back", () => {
    expect(maxAdultBirthDate(at("2026-08-05T10:00:00Z"))).toBe("2008-08-05");
  });

  it("round-trips: the date it returns clears the gate", () => {
    const now = at("2026-08-05T10:00:00Z");
    expect(isAdult(maxAdultBirthDate(now), now)).toBe(true);
  });

  it("respects a custom minimum", () => {
    expect(maxAdultBirthDate(at("2026-08-05T10:00:00Z"), 21)).toBe("2005-08-05");
  });
});
