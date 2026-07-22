import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { parseWithRepair, repairTurns } from "@/lib/ai/repair";
import { withRetry } from "@/lib/ai/retry";
import {
  DEFAULT_MAX_STEPS,
  runToolLoop,
  type ToolCall,
  type ToolLoopDriver,
} from "@/lib/ai/tool-loop";
import type {
  AIProvider,
  CompletionRequest,
  ExtractRequest,
  RunToolsRequest,
  RunToolsResult,
} from "@/lib/ai/types";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 16000;
/** Ceiling for the one-shot token bump when a completion gets truncated. */
const TRUNCATION_BUMP_CAP = 8000;

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
      // Retries are centralized in withRetry; disable the SDK's own loop so we
      // don't stack two backoff schedules.
      client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0 });
    }
    return client;
  }

  function model(req: CompletionRequest) {
    return req.model ?? serverEnv().AI_MODEL ?? DEFAULT_MODEL;
  }

  return {
    name: "openai",

    async complete(req: CompletionRequest) {
      const response = await withRetry(
        () =>
          getClient().chat.completions.create({
            model: model(req),
            max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
            messages: req.messages,
          }),
        { label: "openai:complete" },
      );
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
        const call = (maxTokens: number) =>
          withRetry(
            () =>
              getClient().chat.completions.create({
                model: model(req),
                max_tokens: maxTokens,
                messages,
                response_format: {
                  type: "json_schema",
                  json_schema: { name: req.schemaName, schema: jsonSchema },
                },
              }),
            { label: `openai:extract:${req.schemaName}` },
          );

        let budget = req.maxTokens ?? DEFAULT_MAX_TOKENS;
        let response = await call(budget);
        // finish_reason "length" means the JSON was cut off mid-write and can
        // only fail to parse. Give it one bigger budget before the repair pass.
        if (
          response.choices[0]?.finish_reason === "length" &&
          budget < TRUNCATION_BUMP_CAP
        ) {
          budget = Math.min(budget * 2, TRUNCATION_BUMP_CAP);
          console.warn(
            `[ai-truncation] openai:${req.schemaName} hit length limit; retrying with ${budget}`,
          );
          response = await call(budget);
        }
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

    async runTools(req: RunToolsRequest): Promise<RunToolsResult> {
      const tools: OpenAI.Chat.ChatCompletionTool[] = req.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: z.toJSONSchema(t.inputSchema, {
            target: "draft-7",
          }) as Record<string, unknown>,
        },
      }));
      const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
      const mdl = req.model ?? serverEnv().AI_MODEL ?? DEFAULT_MODEL;
      // The loop mutates this in place - assistant turns and `tool` role
      // results are appended as the conversation grows.
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] =
        req.messages.map((m) => ({ role: m.role, content: m.content }));

      const driver: ToolLoopDriver = {
        async step() {
          const response = await withRetry(
            () =>
              getClient().chat.completions.create({
                model: mdl,
                max_tokens: maxTokens,
                messages,
                tools,
                tool_choice: "auto",
              }),
            { label: "openai:runTools" },
          );
          const message = response.choices[0]?.message;
          const fnCalls = (message?.tool_calls ?? []).filter(
            (call) => call.type === "function",
          );
          // Rebuild the assistant turn in param shape (the response message type
          // isn't directly assignable to the request param type).
          const assistant: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
            role: "assistant",
            content: message?.content ?? "",
          };
          if (fnCalls.length > 0) {
            assistant.tool_calls = fnCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: {
                name: call.function.name,
                arguments: call.function.arguments,
              },
            }));
          }
          messages.push(assistant);
          const toolCalls: ToolCall[] = fnCalls.map((call) => ({
            id: call.id,
            name: call.function.name,
            // Arguments arrive as a JSON string; hand malformed JSON straight
            // through so the loop's schema validation reports it as an error
            // the model can correct, rather than throwing here.
            input: safeParseJson(call.function.arguments),
          }));
          return {
            text: message?.content ?? "",
            toolCalls,
            usage: {
              inputTokens: response.usage?.prompt_tokens ?? 0,
              outputTokens: response.usage?.completion_tokens ?? 0,
            },
          };
        },
        appendResults(results) {
          for (const r of results) {
            messages.push({
              role: "tool",
              tool_call_id: r.id,
              content: r.content,
            });
          }
        },
      };

      return runToolLoop(driver, req.tools, req.maxSteps ?? DEFAULT_MAX_STEPS);
    },
  };
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
