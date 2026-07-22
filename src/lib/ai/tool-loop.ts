import "server-only";
import type { z } from "zod";
import type {
  AITool,
  RunStepInfo,
  RunToolsRequest,
  RunToolsResult,
  TokenUsage,
} from "@/lib/ai/types";

export const DEFAULT_MAX_STEPS = 8;

/**
 * Author a tool with a type-safe handler. The handler receives the value
 * inferred from `inputSchema`; the returned {@link AITool} erases the input
 * type so heterogeneous tools live together in one `AITool[]`. Validation of
 * the model's raw arguments happens in the loop, before the handler runs.
 */
export function defineTool<S extends z.ZodType>(spec: {
  name: string;
  description: string;
  inputSchema: S;
  handler: (input: z.output<S>) => string | Promise<string>;
}): AITool {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    handler: (input) => spec.handler(input as z.output<S>),
  };
}

/** A single tool call the model requested. */
export interface ToolCall {
  /** Provider-assigned id, echoed back on the result so the model can pair them. */
  id: string;
  name: string;
  /** Raw, unvalidated arguments from the model. */
  input: unknown;
}

/** The outcome of running one tool call, fed back to the model. */
export interface ToolResult {
  id: string;
  content: string;
  isError: boolean;
}

/** One assistant turn: free text plus any tool calls it wants run. */
export interface ModelTurn {
  text: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
}

/**
 * The provider-specific half of the loop. Each adapter owns its own message
 * accumulation (Anthropic content blocks vs. OpenAI tool-call messages); the
 * loop below only sees this narrow, provider-agnostic surface.
 */
export interface ToolLoopDriver {
  /** Run one model inference against the accumulated conversation. */
  step(): Promise<ModelTurn>;
  /** Append the results of the just-requested tool calls to the conversation. */
  appendResults(results: ToolResult[]): void;
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * Runs a validated tool call and turns any failure (unknown tool, bad
 * arguments, throwing handler) into an `isError` result rather than aborting
 * the loop, so the model gets a chance to correct course.
 */
async function runOneCall(
  call: ToolCall,
  byName: Map<string, AITool>,
): Promise<ToolResult> {
  const tool = byName.get(call.name);
  if (!tool) {
    return {
      id: call.id,
      content: `Error: unknown tool "${call.name}".`,
      isError: true,
    };
  }
  const parsed = tool.inputSchema.safeParse(call.input);
  if (!parsed.success) {
    return {
      id: call.id,
      content: `Error: invalid arguments for "${call.name}": ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
      isError: true,
    };
  }
  try {
    const output = await tool.handler(parsed.data);
    return { id: call.id, content: output, isError: false };
  } catch (error) {
    return {
      id: call.id,
      content: `Error running "${call.name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
      isError: true,
    };
  }
}

/**
 * The provider-agnostic agent loop: inference → run tools → feed results back,
 * until the model answers without calling a tool or the step cap is hit. Tool
 * failures never break the loop; the step cap prevents runaway conversations.
 */
export async function runToolLoop(
  driver: ToolLoopDriver,
  tools: AITool[],
  maxSteps: number = DEFAULT_MAX_STEPS,
  onStep?: (info: RunStepInfo) => void,
): Promise<RunToolsResult> {
  const steps = Math.max(1, Math.floor(maxSteps));
  const byName = new Map(tools.map((t) => [t.name, t]));
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (let step = 1; step <= steps; step += 1) {
    const turn = await driver.step();
    usage = addUsage(usage, turn.usage);
    onStep?.({
      index: step,
      hadToolCalls: turn.toolCalls.length > 0,
      toolNames: turn.toolCalls.map((c) => c.name),
    });

    if (turn.toolCalls.length === 0) {
      return { text: turn.text, usage, steps: step, stoppedAtStepCap: false };
    }

    // Would-be tool calls on the final allowed inference are not run - there is
    // no further inference to feed them back to. Return the text so far.
    if (step === steps) {
      return { text: turn.text, usage, steps: step, stoppedAtStepCap: true };
    }

    const results = await Promise.all(
      turn.toolCalls.map((call) => runOneCall(call, byName)),
    );
    driver.appendResults(results);
  }

  // Unreachable: the loop always returns within the bound above.
  return { text: "", usage, steps, stoppedAtStepCap: true };
}

export type { RunToolsRequest, RunToolsResult };
