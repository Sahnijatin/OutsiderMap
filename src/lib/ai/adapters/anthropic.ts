import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { parseWithRepair, repairTurns } from "@/lib/ai/repair";
import type {
  AIMessage,
  AIProvider,
  CompletionRequest,
  ExtractRequest,
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

  function model(req: CompletionRequest) {
    return req.model ?? serverEnv().AI_MODEL ?? DEFAULT_MODEL;
  }

  return {
    name: "anthropic",

    async complete(req: CompletionRequest) {
      const { system, turns } = splitMessages(req.messages);
      const response = await getClient().messages.create({
        model: model(req),
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

    stream(req: CompletionRequest): ReadableStream<string> {
      const { system, turns } = splitMessages(req.messages);
      return new ReadableStream<string>({
        async start(controller) {
          try {
            const stream = getClient().messages.stream({
              model: model(req),
              max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
              system,
              messages: turns,
            });
            stream.on("text", (text) => controller.enqueue(text));
            await stream.finalMessage();
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });
    },

    async extract<T>(req: ExtractRequest<T>): Promise<T> {
      const inputSchema = z.toJSONSchema(req.schema, {
        target: "draft-7",
      }) as Anthropic.Tool["input_schema"];
      // tool_use doesn't enforce array length / number ranges, so a failed
      // parse gets one corrective pass (see parseWithRepair).
      return parseWithRepair(req.schema, async (repair) => {
        const { system, turns } = splitMessages(
          repair ? repairTurns(req.messages, repair) : req.messages,
        );
        const response = await getClient().messages.create({
          model: model(req),
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          system,
          messages: turns,
          tools: [
            {
              name: req.schemaName,
              description: `Record the ${req.schemaName} extracted from the conversation.`,
              input_schema: inputSchema,
            },
          ],
          tool_choice: { type: "tool", name: req.schemaName },
        });
        const toolUse = response.content.find(
          (block) => block.type === "tool_use",
        );
        if (!toolUse) {
          throw new Error(
            `Anthropic extract returned no tool_use block for ${req.schemaName}`,
          );
        }
        return toolUse.input;
      });
    },
  };
}
