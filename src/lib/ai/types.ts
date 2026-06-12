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
 * The contract every LLM adapter implements. Three methods cover the
 * product's needs:
 *  - complete: taste summaries, plan narration
 *  - stream:   progressively rendered "why this place, for you" explanations
 *  - extract:  structured output — quiz answers → taste profile,
 *              free-text queries → search intent
 */
export interface AIProvider {
  readonly name: "anthropic" | "openai";
  complete(req: CompletionRequest): Promise<{ text: string; usage: TokenUsage }>;
  stream(req: CompletionRequest): ReadableStream<string>;
  extract<T>(req: ExtractRequest<T>): Promise<T>;
}

export interface EmbeddingProvider {
  /** Returns one embedding vector per input text (1536 dimensions). */
  embed(texts: string[]): Promise<number[][]>;
}
