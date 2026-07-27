import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { parseWithRepair, repairTurns } from "@/lib/ai/repair";
import { withRetry } from "@/lib/ai/retry";
import {
  DEFAULT_MAX_STEPS,
  runToolLoop,
  type ToolLoopDriver,
} from "@/lib/ai/tool-loop";
import type {
  AIMessage,
  AIProvider,
  CompletionRequest,
  ExtractRequest,
  RunToolsRequest,
  RunToolsResult,
} from "@/lib/ai/types";

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 16000;
/** Ceiling for the one-shot token bump when a tool call gets truncated. */
const TRUNCATION_BUMP_CAP = 8000;

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
      // Retries are centralized in withRetry (bounded backoff + jitter under a
      // turn deadline), so the SDK's own retry loop is disabled to avoid
      // stacking two backoff schedules on top of each other.
      client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
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
      const response = await withRetry(
        () =>
          getClient().messages.create({
            model: model(req),
            max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
            system,
            messages: turns,
          }),
        { label: "anthropic:complete" },
      );
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
        const call = (maxTokens: number) =>
          withRetry(
            () =>
              getClient().messages.create({
                model: model(req),
                max_tokens: maxTokens,
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
              }),
            { label: `anthropic:extract:${req.schemaName}` },
          );

        let budget = req.maxTokens ?? DEFAULT_MAX_TOKENS;
        let response = await call(budget);
        // A tool call cut off at max_tokens yields half-written JSON that can
        // only fail schema validation. Give it one bigger budget before we
        // waste the repair pass on a truncation the repair can't fix.
        if (response.stop_reason === "max_tokens" && budget < TRUNCATION_BUMP_CAP) {
          budget = Math.min(budget * 2, TRUNCATION_BUMP_CAP);
          console.warn(
            `[ai-truncation] anthropic:${req.schemaName} hit max_tokens; retrying with ${budget}`,
          );
          response = await call(budget);
        }

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

    async runTools(req: RunToolsRequest): Promise<RunToolsResult> {
      const { system, turns } = splitMessages(req.messages);
      const tools: Anthropic.Tool[] = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: z.toJSONSchema(t.inputSchema, {
          target: "draft-7",
        }) as Anthropic.Tool["input_schema"],
      }));
      const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
      const mdl = req.model ?? serverEnv().AI_MODEL ?? DEFAULT_MODEL;
      // The loop mutates this array in place - each assistant turn and each
      // batch of tool_results is appended as the conversation grows.
      const messages: Anthropic.MessageParam[] = turns.map((t) => ({
        role: t.role,
        content: t.content,
      }));

      const onText = req.onText;
      const driver: ToolLoopDriver = {
        async step() {
          // Stream when a text sink is provided. Transient failures are retried
          // only while no delta has reached the client - most provider blips
          // (429/5xx/socket resets) happen at connection time, before any text
          // flows; once deltas are on the wire a replay would duplicate them,
          // so `retryIf` shuts the retry door the moment the first one lands.
          let emitted = false;
          const response = onText
            ? await withRetry(
                () => {
                  const stream = getClient().messages.stream({
                    model: mdl,
                    max_tokens: maxTokens,
                    system,
                    messages,
                    tools,
                  });
                  stream.on("text", (delta) => {
                    emitted = true;
                    onText(delta);
                  });
                  return stream.finalMessage();
                },
                {
                  label: "anthropic:runTools:stream",
                  retryIf: () => !emitted,
                },
              )
            : await withRetry(
                () =>
                  getClient().messages.create({
                    model: mdl,
                    max_tokens: maxTokens,
                    system,
                    messages,
                    tools,
                  }),
                { label: "anthropic:runTools" },
              );
          messages.push({ role: "assistant", content: response.content });
          const text = response.content
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");
          const toolCalls = response.content
            .filter((block) => block.type === "tool_use")
            .map((block) => ({
              id: block.id,
              name: block.name,
              input: block.input,
            }));
          return {
            text,
            toolCalls,
            usage: {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            },
          };
        },
        appendResults(results) {
          messages.push({
            role: "user",
            content: results.map((r) => ({
              type: "tool_result",
              tool_use_id: r.id,
              content: r.content,
              is_error: r.isError,
            })),
          });
        },
      };

      return runToolLoop(
        driver,
        req.tools,
        req.maxSteps ?? DEFAULT_MAX_STEPS,
        req.onStep,
      );
    },
  };
}
