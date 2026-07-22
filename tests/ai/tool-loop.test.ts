import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { z } from "zod";
import {
  defineTool,
  runToolLoop,
  type ModelTurn,
  type ToolLoopDriver,
  type ToolResult,
} from "@/lib/ai/tool-loop";

const USAGE = { inputTokens: 1, outputTokens: 1 };

/** A driver that replays a scripted sequence of model turns and records the
 *  tool results the loop feeds back. */
function scriptedDriver(turns: ModelTurn[]) {
  let i = 0;
  const appended: ToolResult[][] = [];
  const driver: ToolLoopDriver = {
    async step() {
      if (i >= turns.length) throw new Error("scripted driver exhausted");
      return turns[i++];
    },
    appendResults(results) {
      appended.push(results);
    },
  };
  return { driver, appended, stepCount: () => i };
}

describe("runToolLoop", () => {
  it("calls a tool, feeds the result back, and returns the final text", async () => {
    const handler = vi.fn((input: { q: string }) => `results for ${input.q}`);
    const search = defineTool({
      name: "search",
      description: "search places",
      inputSchema: z.object({ q: z.string() }),
      handler,
    });
    const { driver, appended } = scriptedDriver([
      {
        text: "",
        toolCalls: [{ id: "t1", name: "search", input: { q: "cafe" } }],
        usage: USAGE,
      },
      { text: "Found a cafe.", toolCalls: [], usage: USAGE },
    ]);

    const result = await runToolLoop(driver, [search], 8);

    expect(handler).toHaveBeenCalledWith({ q: "cafe" });
    expect(result.text).toBe("Found a cafe.");
    expect(result.steps).toBe(2);
    expect(result.stoppedAtStepCap).toBe(false);
    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 2 });
    expect(appended[0][0]).toMatchObject({
      id: "t1",
      content: "results for cafe",
      isError: false,
    });
  });

  it("returns immediately when the first turn has no tool calls", async () => {
    const { driver, appended } = scriptedDriver([
      { text: "Hello.", toolCalls: [], usage: USAGE },
    ]);
    const result = await runToolLoop(driver, [], 8);
    expect(result.text).toBe("Hello.");
    expect(result.steps).toBe(1);
    expect(appended).toHaveLength(0);
  });

  it("stops at the step cap without running the final turn's tool calls", async () => {
    const handler = vi.fn(() => "ok");
    const again = defineTool({
      name: "again",
      description: "loops forever",
      inputSchema: z.object({}),
      handler,
    });
    // Every turn wants the tool again — only the step cap ends it.
    const driver: ToolLoopDriver = {
      async step() {
        return {
          text: "working",
          toolCalls: [{ id: "x", name: "again", input: {} }],
          usage: USAGE,
        };
      },
      appendResults() {},
    };

    const result = await runToolLoop(driver, [again], 3);

    expect(result.steps).toBe(3);
    expect(result.stoppedAtStepCap).toBe(true);
    expect(result.text).toBe("working");
    // Tool runs on steps 1 and 2 only; the 3rd turn's call is never executed.
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("turns invalid arguments into an error result the model can recover from", async () => {
    const handler = vi.fn((input: { lat: number }) => `lat ${input.lat}`);
    const geo = defineTool({
      name: "geo",
      description: "needs a numeric lat",
      inputSchema: z.object({ lat: z.number() }),
      handler,
    });
    const { driver, appended } = scriptedDriver([
      {
        text: "",
        toolCalls: [{ id: "t1", name: "geo", input: { lat: "nope" } }],
        usage: USAGE,
      },
      { text: "recovered", toolCalls: [], usage: USAGE },
    ]);

    const result = await runToolLoop(driver, [geo], 8);

    expect(handler).not.toHaveBeenCalled();
    expect(result.text).toBe("recovered");
    expect(appended[0][0].isError).toBe(true);
    expect(appended[0][0].content).toContain("invalid arguments");
  });

  it("reports an unknown tool as an error result", async () => {
    const { driver, appended } = scriptedDriver([
      {
        text: "",
        toolCalls: [{ id: "t1", name: "missing", input: {} }],
        usage: USAGE,
      },
      { text: "done", toolCalls: [], usage: USAGE },
    ]);
    const result = await runToolLoop(driver, [], 8);
    expect(result.text).toBe("done");
    expect(appended[0][0].isError).toBe(true);
    expect(appended[0][0].content).toContain('unknown tool "missing"');
  });

  it("catches a throwing handler and returns an error result", async () => {
    const boom = defineTool({
      name: "boom",
      description: "always throws",
      inputSchema: z.object({}),
      handler: () => {
        throw new Error("kaboom");
      },
    });
    const { driver, appended } = scriptedDriver([
      { text: "", toolCalls: [{ id: "t1", name: "boom", input: {} }], usage: USAGE },
      { text: "handled", toolCalls: [], usage: USAGE },
    ]);
    const result = await runToolLoop(driver, [boom], 8);
    expect(result.text).toBe("handled");
    expect(appended[0][0].isError).toBe(true);
    expect(appended[0][0].content).toContain("kaboom");
  });

  it("runs multiple tool calls in one turn", async () => {
    const echo = defineTool({
      name: "echo",
      description: "echoes",
      inputSchema: z.object({ v: z.string() }),
      handler: (input) => input.v,
    });
    const { driver, appended } = scriptedDriver([
      {
        text: "",
        toolCalls: [
          { id: "a", name: "echo", input: { v: "one" } },
          { id: "b", name: "echo", input: { v: "two" } },
        ],
        usage: USAGE,
      },
      { text: "both done", toolCalls: [], usage: USAGE },
    ]);
    const result = await runToolLoop(driver, [echo], 8);
    expect(result.text).toBe("both done");
    expect(appended[0]).toHaveLength(2);
    expect(appended[0].map((r) => r.content)).toEqual(["one", "two"]);
  });
});
