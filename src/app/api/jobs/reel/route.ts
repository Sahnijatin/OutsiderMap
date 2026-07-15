import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processReelJobs } from "@/lib/reels/jobs";
import { serverEnv } from "@/lib/env";

/**
 * Internal reel worker: claims queued jobs and renders them with ffmpeg.
 * Pinged fire-and-forget on quest completion for a fast turnaround; the
 * cron sweeper retries anything this run misses. CRON_SECRET-guarded.
 */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const report = await processReelJobs(admin, 1);
  return NextResponse.json(report);
}
