import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { completeStop } from "@/lib/quests/machine";
import { maybeRecomputeLearnedSignals } from "@/lib/taste/learn";

/**
 * POST /api/quests/:id/stops/:stopId/complete — complete the unlocked stop,
 * unlock the next (or finish the quest). Media becomes mandatory when the
 * sprint-3 capture flow ships; until then the RPC is called without the
 * media requirement.
 */
const REQUIRE_MEDIA = false;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stopId: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(
    `quest-complete:${ctx.user.id}`,
    60,
    3600,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { stopId } = await params;
  if (!z.string().uuid().safeParse(stopId).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const result = await completeStop(ctx.supabase, stopId, REQUIRE_MEDIA);
    after(async () => {
      await maybeRecomputeLearnedSignals(ctx.user.id);
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't complete that stop.";
    return NextResponse.json(
      { error: "complete_failed", message },
      { status: 400 },
    );
  }
}
