import { describe, it, expect } from "vitest";
import {
  canSendNotification,
  type FrequencyCap,
} from "@/lib/notifications/frequency";

const CAP: FrequencyCap = { perDay: 2, minGapMinutes: 180 };
const NOW = new Date("2026-01-01T12:00:00.000Z");

function capAdmin(result: {
  data: { sent_at: string }[] | null;
  error: unknown;
}) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    order: () => Promise.resolve(result),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => builder } as any;
}

describe("canSendNotification", () => {
  it("allows when there are no recent sends", async () => {
    const ok = await canSendNotification(capAdmin({ data: [], error: null }), "u", CAP, NOW);
    expect(ok).toBe(true);
  });

  it("blocks when the per-day cap is reached", async () => {
    const admin = capAdmin({
      data: [
        { sent_at: "2026-01-01T03:00:00.000Z" },
        { sent_at: "2026-01-01T01:00:00.000Z" },
      ],
      error: null,
    });
    expect(await canSendNotification(admin, "u", CAP, NOW)).toBe(false);
  });

  it("blocks when the last send is within the minimum gap", async () => {
    const admin = capAdmin({
      data: [{ sent_at: "2026-01-01T11:00:00.000Z" }], // 60 min ago < 180
      error: null,
    });
    expect(await canSendNotification(admin, "u", CAP, NOW)).toBe(false);
  });

  it("allows when under the cap and past the gap", async () => {
    const admin = capAdmin({
      data: [{ sent_at: "2026-01-01T08:00:00.000Z" }], // 240 min ago > 180
      error: null,
    });
    expect(await canSendNotification(admin, "u", CAP, NOW)).toBe(true);
  });

  it("fails closed when the log can't be read", async () => {
    const admin = capAdmin({ data: null, error: { message: "db down" } });
    expect(await canSendNotification(admin, "u", CAP, NOW)).toBe(false);
  });
});
