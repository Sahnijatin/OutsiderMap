import "server-only";
import { z } from "zod";
import type { AIMessage } from "@/lib/ai/types";

export type RepairContext = {
  /** The JSON the model returned that failed validation. */
  previousJson: string;
  /** Human-readable description of what was wrong. */
  error: string;
};

/**
 * Thrown when structured output still fails schema validation after the one
 * corrective pass. Carries a clean message (not a raw ZodError) so callers can
 * catch it and present a friendly error instead of crashing the request.
 */
export class AIValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIValidationError";
  }
}

/**
 * Runs a structured-output generation and validates it against `schema`.
 *
 * LLM structured-output modes (OpenAI json_schema, Anthropic tool_use) do not
 * reliably enforce array length limits or number ranges — the model can return
 * too few / too many items, or out-of-range numbers, and only `schema.parse`
 * catches it. Rather than crash, we feed the validation error back for one
 * corrective pass before giving up. `generate` is provider-specific; it must
 * append the repair turns to its prompt when `repair` is supplied.
 */
export async function parseWithRepair<T>(
  schema: z.ZodType<T>,
  generate: (repair?: RepairContext) => Promise<unknown>,
): Promise<T> {
  const candidate = await generate();
  const first = schema.safeParse(candidate);
  if (first.success) return first.data;

  const repaired = await generate({
    previousJson: JSON.stringify(candidate),
    error: z.prettifyError(first.error),
  });
  const second = schema.safeParse(repaired);
  if (second.success) return second.data;
  // Two failed passes is the last word. Surface a typed, clean error instead
  // of a raw ZodError so callers can catch it and degrade gracefully.
  throw new AIValidationError(
    `Model output failed schema validation after one repair attempt: ${z.prettifyError(second.error)}`,
  );
}

/**
 * The two extra turns appended to a prompt on a repair pass: the model's own
 * failed output, then the validation errors with an instruction to fix them.
 */
export function repairTurns(
  base: AIMessage[],
  repair: RepairContext,
): AIMessage[] {
  return [
    ...base,
    { role: "assistant", content: repair.previousJson },
    {
      role: "user",
      content: [
        "Your previous response failed schema validation. Return the corrected data.",
        "",
        "Validation errors:",
        repair.error,
        "",
        "Satisfy every array length limit (min/max items) and number range exactly — these are hard constraints, not suggestions.",
      ].join("\n"),
    },
  ];
}
