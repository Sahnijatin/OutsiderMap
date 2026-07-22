import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { runMapSearch } from "@/lib/chat/map-search";
import { describeError, withTimeout, TimeoutError } from "@/lib/ai/retry";

/**
 * POST /api/map/search — natural-language map search via the lighter
 * shared-brain agent (#99). Understands a phrase / Hinglish query and returns
 * grounded catalog slugs; the client resolves them against the places it has
 * loaded and flies to them. Scoped to find/filter - not conversation.
 */
export const maxDuration = 60;

const TURN_BUDGET_MS = 30_000;

const BodySchema = z.object({
  message: z.string().trim().min(1).max(200),
  city: z.string().trim().max(40).optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`map-search:${ctx.user.id}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const result = await withTimeout(
      runMapSearch(ctx.supabase, {
        message: parsed.data.message,
        userId: ctx.user.id,
        citySlug: parsed.data.city ?? null,
      }),
      TURN_BUDGET_MS,
      "map search",
    );
    return NextResponse.json(result);
  } catch (err) {
    const timedOut = err instanceof TimeoutError;
    console.error(
      "map search failed",
      JSON.stringify({ userId: ctx.user.id, timedOut, ...describeError(err) }),
    );
    return NextResponse.json(
      { error: timedOut ? "timeout" : "failed", slugs: [] },
      { status: timedOut ? 503 : 500 },
    );
  }
}
