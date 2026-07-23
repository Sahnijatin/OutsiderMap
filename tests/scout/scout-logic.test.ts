import { describe, expect, it } from "vitest";
import { distanceMeters, withinRadius, GEO_RADIUS_M } from "@/lib/scout/geo";
import { resolveQuorum } from "@/lib/scout/quorum";
import {
  isLiveCapture,
  isCaptureFresh,
  isImpossibleTravel,
  CAPTURE_FRESH_MINUTES,
} from "@/lib/scout/capture";
import { confirmedBalance, escrowedBalance } from "@/lib/scout/ledger";

describe("geo", () => {
  it("measures ~0 for the same point and a real distance across a city", () => {
    expect(distanceMeters(28.55, 77.19, 28.55, 77.19)).toBeCloseTo(0, 5);
    // Hauz Khas -> ~15km north, should be several km
    const d = distanceMeters(28.55, 77.19, 28.7, 77.1);
    expect(d).toBeGreaterThan(15_000);
    expect(d).toBeLessThan(25_000);
  });

  it("gates within the on-site radius", () => {
    // ~11m apart (0.0001 deg lat) -> inside 150m
    expect(withinRadius(28.55, 77.19, 28.5501, 77.19)).toBe(true);
    // far -> outside
    expect(withinRadius(28.55, 77.19, 28.9, 77.9)).toBe(false);
    expect(GEO_RADIUS_M).toBe(150);
  });
});

describe("resolveQuorum", () => {
  const base = {
    existsValid: 0,
    rejectValid: 0,
    anomalies: 0,
    quorumNeeded: 2,
    quorumNeededReject: 3,
    currentStatus: "open" as const,
  };

  it("publishes at the exists quorum", () => {
    expect(resolveQuorum({ ...base, existsValid: 2 })).toBe("publish");
    expect(resolveQuorum({ ...base, existsValid: 1 })).toBe("pending");
  });

  it("rejects only at the higher not-exists quorum", () => {
    expect(resolveQuorum({ ...base, rejectValid: 2 })).toBe("pending");
    expect(resolveQuorum({ ...base, rejectValid: 3 })).toBe("reject");
  });

  it("holds for admin when anomalies appear without a clean quorum", () => {
    expect(resolveQuorum({ ...base, anomalies: 1 })).toBe("hold");
    // once resolving, doesn't re-hold
    expect(
      resolveQuorum({ ...base, anomalies: 1, currentStatus: "resolving" }),
    ).toBe("pending");
  });

  it("prefers publish over reject/hold when both quorums are somehow met", () => {
    expect(
      resolveQuorum({ ...base, existsValid: 2, rejectValid: 3, anomalies: 5 }),
    ).toBe("publish");
  });
});

describe("capture", () => {
  const now = 1_700_000_000_000;

  it("requires a live camera source, rejecting gallery picks", () => {
    expect(isLiveCapture({ source: "camera" })).toBe(true);
    expect(isLiveCapture({ source: "gallery" })).toBe(false);
    expect(isLiveCapture(null)).toBe(false);
    expect(isLiveCapture("camera")).toBe(false);
  });

  it("accepts fresh captures and rejects stale or future ones", () => {
    expect(isCaptureFresh(now, now)).toBe(true);
    expect(isCaptureFresh(now - 5 * 60_000, now)).toBe(true);
    expect(isCaptureFresh(now - (CAPTURE_FRESH_MINUTES + 5) * 60_000, now)).toBe(
      false,
    );
    expect(isCaptureFresh(now + 10 * 60_000, now)).toBe(false);
    expect(isCaptureFresh(NaN, now)).toBe(false);
  });

  it("flags impossible travel between two captures", () => {
    // 20km in 1 minute -> impossible
    expect(
      isImpossibleTravel(
        { lat: 28.55, lng: 77.19, atMs: now },
        { lat: 28.7, lng: 77.1, atMs: now + 60_000 },
      ),
    ).toBe(true);
    // 200m over 30 minutes -> fine
    expect(
      isImpossibleTravel(
        { lat: 28.55, lng: 77.19, atMs: now },
        { lat: 28.5518, lng: 77.19, atMs: now + 30 * 60_000 },
      ),
    ).toBe(false);
  });
});

describe("ledger math", () => {
  const rows = [
    { delta: 20, status: "confirmed" as const },
    { delta: 10, status: "confirmed" as const },
    { delta: 15, status: "escrow" as const },
    { delta: 30, status: "clawed_back" as const },
  ];

  it("counts only confirmed rows toward balance", () => {
    expect(confirmedBalance(rows)).toBe(30);
  });

  it("reports escrow separately", () => {
    expect(escrowedBalance(rows)).toBe(15);
  });
});
