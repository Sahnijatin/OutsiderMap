import { describe, expect, it } from "vitest";
import { appealWindowOpen, resolveWindowMs, slaStatus } from "@/lib/moderation/sla";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const RECEIVED = "2026-07-22T00:00:00.000Z";
const recMs = Date.parse(RECEIVED);

describe("resolveWindowMs", () => {
  it("uses the tight windows for imagery and orders, 15d otherwise", () => {
    expect(resolveWindowMs("intimate_imagery")).toBe(24 * HOUR);
    expect(resolveWindowMs("court_order")).toBe(36 * HOUR);
    expect(resolveWindowMs("govt_order")).toBe(36 * HOUR);
    expect(resolveWindowMs("spam")).toBe(15 * 24 * HOUR);
  });
});

describe("slaStatus", () => {
  const base = {
    category: "harassment",
    received_at: RECEIVED,
    acknowledged_at: null,
    resolved_at: null,
  };

  it("is not overdue right after receipt", () => {
    const s = slaStatus(base, recMs + HOUR);
    expect(s.ackOverdue).toBe(false);
    expect(s.resolveOverdue).toBe(false);
  });

  it("flags ack overdue after 24h with no acknowledgement", () => {
    expect(slaStatus(base, recMs + 25 * HOUR).ackOverdue).toBe(true);
    expect(
      slaStatus({ ...base, acknowledged_at: RECEIVED }, recMs + 25 * HOUR).ackOverdue,
    ).toBe(false);
  });

  it("flags resolve overdue on the category clock", () => {
    expect(
      slaStatus({ ...base, category: "intimate_imagery" }, recMs + 25 * HOUR).resolveOverdue,
    ).toBe(true);
    // a general grievance is not resolve-overdue at 25h
    expect(slaStatus(base, recMs + 25 * HOUR).resolveOverdue).toBe(false);
  });

  it("stops flagging once resolved", () => {
    expect(
      slaStatus(
        { ...base, category: "intimate_imagery", resolved_at: RECEIVED },
        recMs + 100 * HOUR,
      ).resolveOverdue,
    ).toBe(false);
  });
});

describe("appealWindowOpen", () => {
  it("opens only for a closed grievance within 30 days of resolution", () => {
    expect(
      appealWindowOpen({ status: "resolved", resolved_at: RECEIVED }, recMs + 10 * DAY),
    ).toBe(true);
    expect(
      appealWindowOpen({ status: "rejected", resolved_at: RECEIVED }, recMs + 29 * DAY),
    ).toBe(true);
  });

  it("closes after 30 days", () => {
    expect(
      appealWindowOpen({ status: "resolved", resolved_at: RECEIVED }, recMs + 31 * DAY),
    ).toBe(false);
  });

  it("is closed while the grievance is still open or unresolved", () => {
    expect(appealWindowOpen({ status: "received", resolved_at: null }, recMs)).toBe(false);
    expect(
      appealWindowOpen({ status: "acknowledged", resolved_at: null }, recMs),
    ).toBe(false);
    expect(appealWindowOpen({ status: "appealed", resolved_at: RECEIVED }, recMs)).toBe(
      false,
    );
  });
});
