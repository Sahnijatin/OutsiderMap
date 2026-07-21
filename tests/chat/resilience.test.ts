import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  describeError,
  isTransientError,
  withRetry,
  withTimeout,
  TimeoutError,
} from "@/lib/ai/retry";

describe("isTransientError", () => {
  it("treats overload / 5xx / 429 status as transient", () => {
    expect(isTransientError({ status: 529 })).toBe(true);
    expect(isTransientError({ status: 500 })).toBe(true);
    expect(isTransientError({ status: 429 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
  });

  it("treats network error codes and connection errors as transient", () => {
    expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientError({ code: "UND_ERR_SOCKET" })).toBe(true);
    expect(isTransientError({ name: "APIConnectionError" })).toBe(true);
    expect(isTransientError(new Error("Overloaded"))).toBe(true);
  });

  it("does NOT retry deterministic client errors", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
    expect(isTransientError(new Error("bad schema"))).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});

describe("withRetry", () => {
  it("retries a transient failure then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw { status: 529, message: "overloaded" };
        return "ok";
      },
      { baseDelayMs: 1, maxDelayMs: 2 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws immediately on a non-transient failure (no wasted attempts)", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw { status: 400, message: "bad request" };
        },
        { baseDelayMs: 1 },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it("gives up after exhausting the retry budget", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw { status: 503 };
        },
        { retries: 2, baseDelayMs: 1, maxDelayMs: 2 },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(3); // 1 initial + 2 retries
  });
});

describe("withTimeout", () => {
  it("resolves when the work beats the deadline", async () => {
    await expect(withTimeout(Promise.resolve("done"), 50)).resolves.toBe(
      "done",
    );
  });

  it("rejects with a TimeoutError on overrun", async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 50));
    await expect(withTimeout(slow, 5, "chat turn")).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });
});

describe("describeError", () => {
  it("flattens an unknown throw into a log-safe shape", () => {
    const info = describeError({ name: "APIError", status: 529, message: "x" });
    expect(info).toMatchObject({ name: "APIError", status: 529 });
    expect(describeError("boom")).toMatchObject({ message: "boom" });
  });
});
