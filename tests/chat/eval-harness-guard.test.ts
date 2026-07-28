import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The live harness creates auth users and writes taste profiles. `CHAT_EVAL_LIVE`
 * is the control that stops that happening by accident - from a stray `npm test`,
 * a misconfigured CI job, or a developer running the suite with production
 * credentials in their shell. It is worth a test of its own.
 */

describe("live eval guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses every entry point unless CHAT_EVAL_LIVE is set", async () => {
    vi.stubEnv("CHAT_EVAL_LIVE", "");

    const { runMatrix, seedPersonas, teardownPersonas } = await import(
      "@/lib/chat/eval/harness"
    );
    // A client that would throw loudly if the guard ever let a call through.
    const tripwire = new Proxy(
      {},
      {
        get() {
          throw new Error("guard failed: the harness touched the database");
        },
      },
    ) as never;

    await expect(runMatrix({ admin: tripwire })).rejects.toThrow(
      /CHAT_EVAL_LIVE/,
    );
    await expect(seedPersonas(tripwire)).rejects.toThrow(/CHAT_EVAL_LIVE/);
    await expect(teardownPersonas(tripwire)).rejects.toThrow(/CHAT_EVAL_LIVE/);
  });
});
