import { NextResponse, after, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { completeStop } from "@/lib/quests/machine";
import { maybeRecomputeLearnedSignals } from "@/lib/taste/learn";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueReelJob } from "@/lib/reels/jobs";
import { serverEnv } from "@/lib/env";

/**
 * POST /api/quests/:id/stops/:stopId/complete - complete the unlocked stop,
 * unlock the next (or finish the quest). The capture flow is live: a stop
 * needs at least one captured photo/video before it counts.
 */
const REQUIRE_MEDIA = true;

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

  const { id, stopId } = await params;
  if (!z.string().uuid().safeParse(stopId).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const result = await completeStop(ctx.supabase, stopId, REQUIRE_MEDIA);
    after(async () => {
      await maybeRecomputeLearnedSignals(ctx.user.id);
      if (result.questCompleted) {
        // Queue the reel and nudge the worker; the cron sweeper is the net.
        try {
          const admin = createAdminClient();
          await enqueueReelJob(admin, id, ctx.user.id);
          const env = serverEnv();
          if (env.NEXT_PUBLIC_APP_URL && env.CRON_SECRET) {
            void fetch(`${env.NEXT_PUBLIC_APP_URL}/api/jobs/reel`, {
              method: "POST",
              headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
            }).catch(() => {});
          }
        } catch (err) {
          console.error("reel enqueue failed", err);
        }
      }
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
