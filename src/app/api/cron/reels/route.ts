import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processReelJobs } from "@/lib/reels/jobs";
import { serverEnv } from "@/lib/env";

/**
 * Reel sweeper: requeues stuck renders and processes the queue. The
 * completion-time ping handles the happy path; this is the retry net.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const report = await processReelJobs(admin, 2);
  return NextResponse.json(report);
}
