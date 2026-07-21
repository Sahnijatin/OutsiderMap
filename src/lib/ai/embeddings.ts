import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";
import { withRetry } from "@/lib/ai/retry";
import type { EmbeddingProvider } from "@/lib/ai/types";

/**
 * Embeddings are a separate interface from AIProvider: Anthropic has no
 * embeddings API, so the chat provider and embedding provider are selected
 * independently. Default: OpenAI text-embedding-3-small (1536 dims), which
 * matches the vector(1536) columns in the schema.
 */
const EMBEDDING_MODEL = "text-embedding-3-small";

export function getEmbeddings(): EmbeddingProvider {
  return {
    async embed(texts: string[]) {
      const env = serverEnv();
      if (!env.OPENAI_API_KEY) {
        throw new Error("Embeddings require OPENAI_API_KEY to be set");
      }
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0 });
      const response = await withRetry(
        () =>
          client.embeddings.create({
            model: EMBEDDING_MODEL,
            input: texts,
          }),
        { label: "openai:embeddings", retries: 3 },
      );
      return response.data.map((d) => d.embedding);
    },
  };
}
