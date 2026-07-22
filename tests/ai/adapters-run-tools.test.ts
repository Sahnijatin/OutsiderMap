import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock both SDKs at the module boundary - no network, no real client.
const anthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

const openaiCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreate } };
  },
}));

import { z } from "zod";
import { createAnthropicProvider } from "@/lib/ai/adapters/anthropic";
import { createOpenAIProvider } from "@/lib/ai/adapters/openai";
import { defineTool } from "@/lib/ai/tool-loop";

beforeEach(() => {
  anthropicCreate.mockReset();
  openaiCreate.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
  process.env.OPENAI_API_KEY = "test-openai";
});

const searchTool = (handler: (input: { q: string }) => string) =>
  defineTool({
    name: "search",
    description: "search places",
    inputSchema: z.object({ q: z.string() }),
    handler,
  });

describe("anthropic adapter runTools", () => {
  it("drives a tool loop end to end and feeds the result back", async () => {
    anthropicCreate
      .mockResolvedValueOnce({
        content: [
          { type: "text", text: "let me search" },
          { type: "tool_use", id: "toolu_1", name: "search", input: { q: "ramen" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "tool_use",
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "Try Ippudo." }],
        usage: { input_tokens: 8, output_tokens: 3 },
        stop_reason: "end_turn",
      });

    const handler = vi.fn((input: { q: string }) => `ramen for ${input.q}`);
    const provider = createAnthropicProvider();
    const result = await provider.runTools({
      messages: [{ role: "user", content: "best ramen?" }],
      tools: [searchTool(handler)],
    });

    expect(result.text).toBe("Try Ippudo.");
    expect(result.steps).toBe(2);
    expect(result.stoppedAtStepCap).toBe(false);
    expect(result.usage).toEqual({ inputTokens: 18, outputTokens: 8 });
    expect(handler).toHaveBeenCalledWith({ q: "ramen" });

    // The tool schema was compiled and passed to the model.
    expect(anthropicCreate.mock.calls[0][0].tools[0]).toMatchObject({
      name: "search",
    });
    // The tool_result was appended as a user turn (find it - the messages array
    // is mutated in place, so its final "last" element is the closing turn).
    const messages = anthropicCreate.mock.calls[1][0].messages;
    const toolResultMsg = messages.find(
      (m: { role: string; content: unknown }) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        m.content[0]?.type === "tool_result",
    );
    expect(toolResultMsg.content[0]).toMatchObject({
      tool_use_id: "toolu_1",
      content: "ramen for ramen",
      is_error: false,
    });
  });

  it("honours the step cap", async () => {
    anthropicCreate.mockResolvedValue({
      content: [
        { type: "tool_use", id: "toolu_x", name: "search", input: { q: "x" } },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "tool_use",
    });
    const provider = createAnthropicProvider();
    const result = await provider.runTools({
      messages: [{ role: "user", content: "loop" }],
      tools: [searchTool(() => "r")],
      maxSteps: 2,
    });
    expect(result.steps).toBe(2);
    expect(result.stoppedAtStepCap).toBe(true);
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
  });
});

describe("openai adapter runTools", () => {
  it("drives a tool loop end to end and feeds the result back", async () => {
    openaiCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "searching",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "search",
                    arguments: JSON.stringify({ q: "ramen" }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "Try Ippudo." } }],
        usage: { prompt_tokens: 8, completion_tokens: 3 },
      });

    const handler = vi.fn((input: { q: string }) => `ramen for ${input.q}`);
    const provider = createOpenAIProvider();
    const result = await provider.runTools({
      messages: [{ role: "user", content: "best ramen?" }],
      tools: [searchTool(handler)],
    });

    expect(result.text).toBe("Try Ippudo.");
    expect(result.steps).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 18, outputTokens: 8 });
    expect(handler).toHaveBeenCalledWith({ q: "ramen" });

    // The tool result was appended as a `tool` role message.
    const toolMsg = openaiCreate.mock.calls[1][0].messages.find(
      (m: { role: string }) => m.role === "tool",
    );
    expect(toolMsg).toMatchObject({
      tool_call_id: "call_1",
      content: "ramen for ramen",
    });
  });

  it("passes malformed tool arguments through to schema validation", async () => {
    openaiCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call_bad",
                  type: "function",
                  function: { name: "search", arguments: "{not json" },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 4, completion_tokens: 2 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "recovered" } }],
        usage: { prompt_tokens: 4, completion_tokens: 2 },
      });

    const handler = vi.fn((input: { q: string }) => input.q);
    const provider = createOpenAIProvider();
    const result = await provider.runTools({
      messages: [{ role: "user", content: "go" }],
      tools: [searchTool(handler)],
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.text).toBe("recovered");
    const toolMsg = openaiCreate.mock.calls[1][0].messages.find(
      (m: { role: string }) => m.role === "tool",
    );
    expect(toolMsg.content).toContain("invalid arguments");
  });
});
