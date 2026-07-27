import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  memoryRateLimit,
  resetMemoryRateLimit,
} from "@/lib/security/rate-limit";

/**
 * The in-process sliding-window fallback (§1.4): rate limiting must not
 * degrade to "unlimited" in production just because Upstash is unconfigured.
 */

const T0 = 1_700_000_000_000;

beforeEach(() => {
  resetMemoryRateLimit();
  // serverEnv() requires the Supabase pair; Upstash stays unset so the
  // checkRateLimit tests exercise the unconfigured path.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("memoryRateLimit", () => {
  it("allows requests under the limit", () => {
    expect(memoryRateLimit("k", 3, 60, T0)).toBe(true);
    expect(memoryRateLimit("k", 3, 60, T0 + 1000)).toBe(true);
    expect(memoryRateLimit("k", 3, 60, T0 + 2000)).toBe(true);
  });

  it("blocks requests over the limit", () => {
    for (let i = 0; i < 3; i++) {
      expect(memoryRateLimit("k", 3, 60, T0 + i)).toBe(true);
    }
    expect(memoryRateLimit("k", 3, 60, T0 + 3)).toBe(false);
    expect(memoryRateLimit("k", 3, 60, T0 + 4)).toBe(false);
  });

  it("slides the window: old hits expire and free capacity", () => {
    expect(memoryRateLimit("k", 2, 60, T0)).toBe(true);
    expect(memoryRateLimit("k", 2, 60, T0 + 30_000)).toBe(true);
    // Window full at +40s...
    expect(memoryRateLimit("k", 2, 60, T0 + 40_000)).toBe(false);
    // ...the first hit falls out of the 60s window, the second hasn't yet.
    expect(memoryRateLimit("k", 2, 60, T0 + 61_000)).toBe(true);
    expect(memoryRateLimit("k", 2, 60, T0 + 62_000)).toBe(false);
  });

  it("keeps keys independent", () => {
    expect(memoryRateLimit("a", 1, 60, T0)).toBe(true);
    expect(memoryRateLimit("a", 1, 60, T0 + 1)).toBe(false);
    expect(memoryRateLimit("b", 1, 60, T0 + 2)).toBe(true);
  });
});

describe("checkRateLimit without Upstash", () => {
  it("engages the in-process fallback in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await checkRateLimit("prod-key", 2, 3600)).toBe(true);
    expect(await checkRateLimit("prod-key", 2, 3600)).toBe(true);
    expect(await checkRateLimit("prod-key", 2, 3600)).toBe(false);
  });

  it("still fails open outside production", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await checkRateLimit("dev-key", 2, 3600)).toBe(true);
    }
  });
});
