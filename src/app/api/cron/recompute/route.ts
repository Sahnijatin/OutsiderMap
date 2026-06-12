import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeLearnedSignals } from "@/lib/taste/learn";
import { serverEnv } from "@/lib/env";

export const maxDuration = 300;

/**
 * Nightly learned-signals recompute for everyone active in the last 24h.
 * Wire to Vercel Cron; authenticated with CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("interaction_events")
    .select("user_id")
    .gte("created_at", since)
    .limit(5000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
  const failures: string[] = [];
  for (const userId of userIds) {
    try {
      await recomputeLearnedSignals(userId);
    } catch {
      failures.push(userId);
    }
  }

  return NextResponse.json({
    recomputed: userIds.length - failures.length,
    failed: failures.length,
  });
}
