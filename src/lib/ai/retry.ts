import "server-only";

/**
 * Shared resilience primitives for the AI call sites. Two failure classes get
 * distinct handling:
 *
 *  - Transient provider failures (429/500/502/503/504/529, socket resets,
 *    "overloaded") mean the request never reached a deterministic answer, so a
 *    retry with backoff may succeed. `withRetry` owns this.
 *  - A whole turn overrunning the platform's function timeout gives the client
 *    a non-JSON 504 it can't parse (issue #38). `withTimeout` converts that into
 *    a controlled rejection we can turn into clean JSON before the platform
 *    pulls the plug.
 *
 * Schema-validation failures are NOT retried here - those go through
 * parseWithRepair, which feeds the error back for one corrective pass.
 */

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

const RETRYABLE_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

/** A flat, log-safe view of an unknown thrown value. */
export type ErrorInfo = {
  name: string;
  status: number | null;
  code: string | null;
  message: string;
};

export function describeError(err: unknown): ErrorInfo {
  if (!err || typeof err !== "object") {
    return { name: "unknown", status: null, code: null, message: String(err) };
  }
  const e = err as {
    name?: string;
    status?: number;
    code?: string | number;
    message?: string;
  };
  return {
    name: e.name ?? "Error",
    status: typeof e.status === "number" ? e.status : null,
    code: e.code != null ? String(e.code) : null,
    message: (e.message ?? "").slice(0, 300),
  };
}

/**
 * True when retrying `err` could plausibly succeed: an HTTP status the provider
 * uses for overload/transient conditions, a network-level error code, or an SDK
 * connection error. Deterministic failures (400/401/404, schema errors) return
 * false so we fail fast instead of hammering a request that will never work.
 */
export function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    name?: string;
    status?: number;
    code?: string | number;
    message?: string;
  };
  if (typeof e.status === "number" && RETRYABLE_STATUS.has(e.status)) return true;
  if (e.code != null && RETRYABLE_CODES.has(String(e.code))) return true;
  if (e.name === "APIConnectionError" || e.name === "APIConnectionTimeoutError") {
    return true;
  }
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("overloaded") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up")
  );
}

export type RetryOptions = {
  /** Extra attempts after the first (default 2, so up to 3 tries total). */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  label?: string;
  /**
   * Extra gate consulted before each retry. Lets a caller stop retrying once a
   * retry stopped being safe - e.g. a streamed call that already emitted text
   * to the client, where a replay would duplicate what the user has seen.
   */
  retryIf?: () => boolean;
};

/**
 * Runs `fn`, retrying transient failures with exponential backoff plus jitter.
 * Non-transient errors throw immediately. The delay is capped so a bounded
 * number of retries can't blow the turn's overall time budget.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 400;
  const max = opts.maxDelayMs ?? 4000;
  const label = opts.label ?? "ai-call";

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isTransientError(err)) throw err;
      if (opts.retryIf && !opts.retryIf()) throw err;
      const ceiling = Math.min(max, base * 2 ** attempt);
      // Full jitter over [ceiling/2, ceiling] avoids thundering-herd sync.
      const delayMs = ceiling * (0.5 + Math.random() * 0.5);
      attempt += 1;
      console.warn(
        `[ai-retry] ${label} attempt ${attempt}/${retries} after transient error; backing off ${Math.round(
          delayMs,
        )}ms`,
        describeError(err),
      );
      await sleep(delayMs);
    }
  }
}

/** Raised by withTimeout when the wrapped work overruns its budget. */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Races `promise` against a deadline. On overrun it rejects with a TimeoutError
 * so the caller can return clean JSON instead of letting the platform emit a
 * non-JSON 504. The underlying work is not aborted - the value is simply
 * abandoned - which is acceptable here: a stray persisted message costs nothing
 * next to a broken client parse.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new TimeoutError(`${label} exceeded ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer),
  ) as Promise<T>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
