/**
 * Precise answer instrumentation (#120 part 2a). The one confident answer the
 * app serves — chat picks or Right Now — emits `answer_served` with a unique
 * `answer_id`; when the member acts on it (clicks a pick) the client echoes
 * that id back and we emit `answer_accepted`. Joining the two by `answer_id`
 * gives an exact accept-rate, replacing part 1's time-window proxy.
 *
 * These builders are the single source of truth for the payload shape, shared
 * by the chat engine, the Right Now route, and the interactions route, so the
 * `answer_id` join key can never drift between the serve and accept sides.
 */
import type { Json } from "@/types/database";

export const ANSWER_SERVED = "answer_served" as const;
export const ANSWER_ACCEPTED = "answer_accepted" as const;

/** Where a served answer came from — the surface, for later breakdowns. */
export type AnswerSource = "chat" | "now";

/** A fresh id for one served answer. Web Crypto is available in both runtimes. */
export function newAnswerId(): string {
  return crypto.randomUUID();
}

export function servedPayload(input: {
  answerId: string;
  source: AnswerSource;
  query?: string;
  picks?: string[];
  /** Set when this answer was served under an A/B experiment (#120 part 2b). */
  experiment?: string;
  variant?: string;
}): Record<string, Json> {
  const payload: Record<string, Json> = {
    answer_id: input.answerId,
    source: input.source,
  };
  if (input.query) payload.query = input.query;
  if (input.picks) payload.picks = input.picks;
  // Both or neither — a variant is meaningless without its experiment.
  if (input.experiment && input.variant) {
    payload.experiment = input.experiment;
    payload.variant = input.variant;
  }
  return payload;
}

export function acceptedPayload(answerId: string): Record<string, Json> {
  return { answer_id: answerId };
}
