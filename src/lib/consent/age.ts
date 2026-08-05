/**
 * Age verification for the DPDP §9 gate.
 *
 * Pure, and time is a parameter rather than a call to Date.now() - the same
 * shape as lib/moderation/sla.ts, and for the same reason: a birthday boundary
 * is exactly the kind of thing you want to test at 23:59 on the day before
 * without mocking the clock.
 *
 * The authority is the server: public.set_date_of_birth() recomputes the age
 * from current_date, and a client that could post its own verdict would not be
 * a gate. These helpers exist to render the form, give an honest error before
 * the round trip, and let the age rule be unit-tested.
 *
 * NOTE on timezones: this computes in UTC while the RPC uses Postgres
 * current_date. On a member's exact 18th birthday the two can disagree by a
 * few hours. That is immaterial for an 18+ gate and the RPC wins, which is the
 * correct direction for a disagreement to resolve.
 */

export const MINIMUM_AGE_YEARS = 18;
export const MAX_PLAUSIBLE_AGE_YEARS = 120;

export type DobParts = { y: number; m: number; d: number };

export type DobVerdict =
  | { ok: true; age: number }
  | {
      ok: false;
      reason: "malformed" | "future" | "implausible" | "underage";
      age: number | null;
    };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Strict YYYY-MM-DD parse.
 *
 * Deliberately not Date.parse(): "2008-02-29" is a real date and a bare
 * `new Date(string)` would resolve it in the runtime's zone, shifting the day
 * for anyone west of UTC. Unpadded months ("2008-2-9") are rejected rather
 * than guessed at.
 */
export function parseDob(raw: string): DobParts | null {
  const match = ISO_DATE.exec(raw.trim());
  if (!match) return null;

  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Round-trip through UTC to reject 31 April and 29 February in a common
  // year, which the range check above lets through.
  const asUtc = Date.UTC(y, m - 1, d);
  const back = new Date(asUtc);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== m - 1 ||
    back.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

/**
 * Completed years between `dob` and `nowMs`, or null if unparseable.
 *
 * Compares (month, day) tuples rather than subtracting timestamps, so leap-day
 * birthdays need no special case: someone born 2008-02-29 has not yet had a
 * birthday on 2026-02-28, and has on 2026-03-01.
 */
export function ageInYears(dob: string, nowMs: number): number | null {
  const parts = parseDob(dob);
  if (!parts) return null;

  const now = new Date(nowMs);
  const nowY = now.getUTCFullYear();
  const nowM = now.getUTCMonth() + 1;
  const nowD = now.getUTCDate();

  let age = nowY - parts.y;
  const hadBirthday = nowM > parts.m || (nowM === parts.m && nowD >= parts.d);
  if (!hadBirthday) age -= 1;
  return age;
}

export function isAdult(
  dob: string,
  nowMs: number,
  minimum: number = MINIMUM_AGE_YEARS,
): boolean {
  const age = ageInYears(dob, nowMs);
  return age !== null && age >= minimum;
}

/**
 * The full verdict, in the order the errors should be reported: a future date
 * is a typo, not a claim of being unborn, and saying "you are too young" to
 * someone who typed 2027 would be nonsense.
 */
export function verifyDateOfBirth(raw: string, nowMs: number): DobVerdict {
  const age = ageInYears(raw, nowMs);
  if (age === null) return { ok: false, reason: "malformed", age: null };
  if (age < 0) return { ok: false, reason: "future", age };
  if (age > MAX_PLAUSIBLE_AGE_YEARS) {
    return { ok: false, reason: "implausible", age };
  }
  if (age < MINIMUM_AGE_YEARS) return { ok: false, reason: "underage", age };
  return { ok: true, age };
}

/**
 * The latest date of birth that still clears the gate, as YYYY-MM-DD.
 *
 * Feeds the `max` attribute on the date input so the picker cannot offer a
 * date that will be refused. Not a security control - the RPC is - just a way
 * to fail before the round trip rather than after it.
 */
export function maxAdultBirthDate(
  nowMs: number,
  minimum: number = MINIMUM_AGE_YEARS,
): string {
  const now = new Date(nowMs);
  const y = now.getUTCFullYear() - minimum;
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  // Date.UTC normalizes 29 February in a non-leap target year to 1 March,
  // which errs toward accepting - the RPC still has the final say.
  const capped = new Date(Date.UTC(y, m, d));
  return capped.toISOString().slice(0, 10);
}

/**
 * If the waitlist apply form is ever revived (it is dormant - see
 * docs/RUNBOOK-prod.md), it must call verifyDateOfBirth before insert and the
 * waitlist table needs its own date_of_birth column: an applicant has no
 * profiles row yet, so set_date_of_birth cannot cover them.
 */
