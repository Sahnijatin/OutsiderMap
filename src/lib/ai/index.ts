import "server-only";
import { serverEnv } from "@/lib/env";
import { createAnthropicProvider } from "@/lib/ai/adapters/anthropic";
import { createOpenAIProvider } from "@/lib/ai/adapters/openai";
import type { AIProvider } from "@/lib/ai/types";

export type { AIProvider, AIMessage, CompletionRequest } from "@/lib/ai/types";
export { getEmbeddings } from "@/lib/ai/embeddings";

let provider: AIProvider | null = null;

/**
 * Returns the configured LLM provider (env: AI_PROVIDER, AI_MODEL).
 * Every consumer goes through this factory — no direct SDK imports
 * outside src/lib/ai/.
 */
export function getAI(): AIProvider {
  if (!provider) {
    provider =
      serverEnv().AI_PROVIDER === "openai"
        ? createOpenAIProvider()
        : createAnthropicProvider();
  }
  return provider;
}
