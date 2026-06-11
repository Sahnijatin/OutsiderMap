import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";
import {
  NotImplementedError,
  type AIProvider,
  type CompletionRequest,
  type ExtractRequest,
} from "@/lib/ai/types";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 16000;

export function createOpenAIProvider(): AIProvider {
  let client: OpenAI | null = null;

  function getClient() {
    if (!client) {
      const env = serverEnv();
      if (!env.OPENAI_API_KEY) {
        throw new Error(
          "AI_PROVIDER is 'openai' but OPENAI_API_KEY is not set",
        );
      }
      client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    return client;
  }

  return {
    name: "openai",

    async complete(req: CompletionRequest) {
      const response = await getClient().chat.completions.create({
        model: req.model ?? serverEnv().AI_MODEL ?? DEFAULT_MODEL,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: req.messages,
      });
      return {
        text: response.choices[0]?.message?.content ?? "",
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
      };
    },

    stream(): ReadableStream<string> {
      // Phase 3: chat.completions.create({stream: true}) deltas piped into
      // a ReadableStream.
      throw new NotImplementedError("OpenAIProvider.stream");
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async extract<T>(_req: ExtractRequest<T>): Promise<T> {
      // Phase 2: response_format json_schema, validated post-hoc with the
      // same zod schema as the Anthropic adapter.
      throw new NotImplementedError("OpenAIProvider.extract");
    },
  };
}
