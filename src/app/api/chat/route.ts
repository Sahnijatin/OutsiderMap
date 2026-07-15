import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { runChatTurn } from "@/lib/chat/engine";

/**
 * POST /api/chat — one conversational turn. Two LLM calls on the recommend
 * path, so the rate limit is tighter than browse endpoints.
 */
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

  try {
    const result = await runChatTurn(ctx.supabase, ctx.user.id, parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    console.error("chat turn failed", err);
    return NextResponse.json(
      {
        error: "chat_failed",
        message: "Lost my train of thought - say that again?",
      },
      { status: 500 },
    );
  }
}
