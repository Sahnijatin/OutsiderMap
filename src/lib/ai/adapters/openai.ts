import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { parseWithRepair, repairTurns } from "@/lib/ai/repair";
import type {
  AIProvider,
  CompletionRequest,
  ExtractRequest,
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

  function model(req: CompletionRequest) {
    return req.model ?? serverEnv().AI_MODEL ?? DEFAULT_MODEL;
  }

  return {
    name: "openai",

    async complete(req: CompletionRequest) {
      const response = await getClient().chat.completions.create({
        model: model(req),
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

    stream(req: CompletionRequest): ReadableStream<string> {
      return new ReadableStream<string>({
        async start(controller) {
          try {
            const stream = await getClient().chat.completions.create({
              model: model(req),
              max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
              messages: req.messages,
              stream: true,
            });
            for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta?.content;
              if (delta) controller.enqueue(delta);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
    },

    async extract<T>(req: ExtractRequest<T>): Promise<T> {
      const jsonSchema = z.toJSONSchema(req.schema, {
        target: "draft-7",
      }) as Record<string, unknown>;
      // json_schema mode doesn't enforce array length / number ranges, so a
      // failed parse gets one corrective pass (see parseWithRepair).
      return parseWithRepair(req.schema, async (repair) => {
        const messages = repair ? repairTurns(req.messages, repair) : req.messages;
        const response = await getClient().chat.completions.create({
          model: model(req),
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages,
          response_format: {
            type: "json_schema",
            json_schema: { name: req.schemaName, schema: jsonSchema },
          },
        });
        const text = response.choices[0]?.message?.content;
        if (!text) {
          throw new Error(
            `OpenAI extract returned no content for ${req.schemaName}`,
          );
        }
        try {
          return JSON.parse(text) as unknown;
        } catch {
          // Non-JSON output (truncation / refusal). Hand the raw text back so
          // parseWithRepair treats it as a validation failure and runs the
          // corrective pass, rather than throwing an opaque SyntaxError that
          // skips repair entirely.
          return text;
        }
      });
    },
  };
}
