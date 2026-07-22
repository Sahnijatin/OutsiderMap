import "server-only";
import type { z } from "zod";

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface CompletionRequest {
  messages: AIMessage[];
  /** Override the adapter's default model. */
  model?: string;
  maxTokens?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractRequest<T> extends CompletionRequest {
  schema: z.ZodType<T>;
  schemaName: string;
}

/**
 * A provider-agnostic tool the model can call during a runTools loop. The zod
 * schema is the single source of truth: it is compiled to JSON Schema for the
 * provider's tool-calling API and validates the arguments the model produces
 * before `handler` runs. `handler` receives arguments already validated
 * against `inputSchema`; its returned string is fed back to the model verbatim.
 *
 * Author tools with `defineTool` (see tool-loop.ts) for a type-safe handler.
 */
export interface AITool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (input: unknown) => string | Promise<string>;
}

export interface RunToolsRequest {
  messages: AIMessage[];
  tools: AITool[];
  /** Override the adapter's default model. */
  model?: string;
  maxTokens?: number;
  /**
   * Maximum model inferences in the agent loop (each turn may fan out to
   * several tool calls). Bounds runaway loops. Default 8.
   */
  maxSteps?: number;
  /**
   * Streamed assistant text deltas as the model generates - the final answer,
   * plus any interim narration a tool-calling turn emits. When set, the adapter
   * streams (and skips its retry wrapper, since a mid-stream retry would replay
   * text); when absent, runTools makes ordinary non-streamed calls.
   */
  onText?: (delta: string) => void;
  /** Fired after each model turn, before its tool calls run - a turn boundary. */
  onStep?: (info: RunStepInfo) => void;
}

export interface RunStepInfo {
  /** 1-based inference index. */
  index: number;
  /** True when this turn asked to call tools (so its text was interim). */
  hadToolCalls: boolean;
  toolNames: string[];
}

export interface RunToolsResult {
  /**
   * The model's final text once it stops calling tools. If the loop stops at
   * the step cap with tools still pending, this is the last turn's text.
   */
  text: string;
  usage: TokenUsage;
  /** Number of model inferences performed. */
  steps: number;
  /** True when the loop stopped at maxSteps with tool calls still pending. */
  stoppedAtStepCap: boolean;
}

/**
 * The contract every LLM adapter implements:
 *  - complete: taste summaries, plan narration
 *  - stream:   progressively rendered "why this place, for you" explanations
 *  - extract:  structured output - quiz answers → taste profile,
 *              free-text queries → search intent
 *  - runTools: agentic tool-use loop - the chat agent calls tools (search,
 *              recommend, ...) and the model drives to a final answer
 */
export interface AIProvider {
  readonly name: "anthropic" | "openai";
  complete(req: CompletionRequest): Promise<{ text: string; usage: TokenUsage }>;
  stream(req: CompletionRequest): ReadableStream<string>;
  extract<T>(req: ExtractRequest<T>): Promise<T>;
  runTools(req: RunToolsRequest): Promise<RunToolsResult>;
}

export interface EmbeddingProvider {
  /** Returns one embedding vector per input text (1536 dimensions). */
  embed(texts: string[]): Promise<number[][]>;
}
