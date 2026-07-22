import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { runChatTurn } from "@/lib/chat/engine";
import { describeError, withTimeout, TimeoutError } from "@/lib/ai/retry";

/**
 * POST /api/chat — one conversational turn. Two LLM calls on the recommend
 * path, so the rate limit is tighter than browse endpoints, and the route
 * needs real time: without maxDuration the platform default timeout kills
 * the turn mid-flight and the client receives a non-JSON 504 (issue #38).
 */
export const maxDuration = 300;

/**
 * App-level turn budget, kept just under the smallest platform function cap
 * (Vercel Hobby hard-caps at 60s regardless of maxDuration). Overrunning this
 * rejects with a TimeoutError we turn into clean JSON, instead of letting the
 * platform emit a non-JSON 504 the client can't parse (issue #38).
 */
const TURN_BUDGET_MS = 55_000;

const BodySchema = z.object({
  threadId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(600),
});

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`chat:${ctx.user.id}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Slow down a little - try again in a bit." },
      { status: 429 },
    );
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const startedAt = Date.now();

  // Streaming path: the client sends `Accept: text/event-stream` and gets the
  // reply token-by-token (masking the multi-step agent latency), a `reset` at
  // each tool-calling turn boundary, and a final `done` frame with the picks.
  const wantsStream = request.headers
    .get("accept")
    ?.includes("text/event-stream");
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };
        try {
          const result = await withTimeout(
            runChatTurn(ctx.supabase, ctx.user.id, parsed.data, {
              onDelta: (text) => send("delta", { text }),
              onToolStep: ({ toolNames }) => send("reset", { tools: toolNames }),
            }),
            TURN_BUDGET_MS,
            "chat turn",
          );
          send("done", result);
        } catch (err) {
          const timedOut = err instanceof TimeoutError;
          console.error(
            "chat turn failed",
            JSON.stringify({
              userId: ctx.user.id,
              threadId: parsed.data.threadId ?? null,
              elapsedMs: Date.now() - startedAt,
              timedOut,
              streamed: true,
              ...describeError(err),
            }),
          );
          send("error", {
            error: timedOut ? "chat_timeout" : "chat_failed",
            message: timedOut
              ? "That took a beat too long on my end - give it another go."
              : "Lost my train of thought - say that again?",
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  try {
    const result = await withTimeout(
      runChatTurn(ctx.supabase, ctx.user.id, parsed.data),
      TURN_BUDGET_MS,
      "chat turn",
    );
    return NextResponse.json(result);
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const timedOut = err instanceof TimeoutError;
    const info = describeError(err);
    // Structured, greppable diagnostics: which turn, how long, why. The engine
    // already degrades individual steps, so reaching here means a hard failure
    // (timeout, DB error) rather than a single flaky LLM call.
    console.error(
      "chat turn failed",
      JSON.stringify({
        userId: ctx.user.id,
        threadId: parsed.data.threadId ?? null,
        elapsedMs,
        timedOut,
        ...info,
      }),
    );
    return NextResponse.json(
      {
        error: timedOut ? "chat_timeout" : "chat_failed",
        code: timedOut ? "timeout" : info.code ?? info.name,
        message: timedOut
          ? "That took a beat too long on my end - give it another go."
          : "Lost my train of thought - say that again?",
      },
      { status: timedOut ? 503 : 500 },
    );
  }
}
