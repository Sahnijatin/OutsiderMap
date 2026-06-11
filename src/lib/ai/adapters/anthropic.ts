import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import {
  NotImplementedError,
  type AIMessage,
  type AIProvider,
  type CompletionRequest,
  type ExtractRequest,
} from "@/lib/ai/types";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 16000;

function splitMessages(messages: AIMessage[]) {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages
    .filter((m): m is AIMessage & { role: "user" | "assistant" } =>
      m.role !== "system",
    )
    .map((m) => ({ role: m.role, content: m.content }));
  return { system: system || undefined, turns };
}

export function createAnthropicProvider(): AIProvider {
  let client: Anthropic | null = null;

  function getClient() {
    if (!client) {
      const env = serverEnv();
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error(
          "AI_PROVIDER is 'anthropic' but ANTHROPIC_API_KEY is not set",
        );
      }
      client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
    return client;
  }

  return {
    name: "anthropic",

    async complete(req: CompletionRequest) {
      const { system, turns } = splitMessages(req.messages);
      const response = await getClient().messages.create({
        model: req.model ?? serverEnv().AI_MODEL ?? DEFAULT_MODEL,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        system,
        messages: turns,
      });
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },

    stream(): ReadableStream<string> {
      // Phase 3: client.messages.stream() text deltas piped into a
      // ReadableStream for the recommendation "why" explanations.
      throw new NotImplementedError("AnthropicProvider.stream");
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async extract<T>(_req: ExtractRequest<T>): Promise<T> {
      // Phase 2: structured outputs via output_config.format (json_schema),
      // validated post-hoc with the same zod schema as the OpenAI adapter.
      throw new NotImplementedError("AnthropicProvider.extract");
    },
  };
}
