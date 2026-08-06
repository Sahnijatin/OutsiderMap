import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processIngestItems } from "@/lib/ingest/pipeline";
import { sweepPublishedWithoutEmbeddings } from "@/lib/admin/embed-sweep";
import { runRetentionSweep } from "@/lib/account/retention-sweep";
import { serverEnv } from "@/lib/env";

/**
 * The one daily sweeper (Vercel Hobby allows max 2 crons, daily-only - see
 * scripts/check-vercel-config.mjs). Inline kicks remain the fast path for
 * ingest (inbox submit); this is the retry net for anything those kicks
 * missed.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const ingest = await processIngestItems(admin, 25);

  // Safety net: published places with no embedding are invisible to
  // chat/search (match_places filters `embedding is not null`). Quorum
  // publishes flip is_published in SQL and cannot embed, so this sweep gives
  // them one, up to 50 a day. Skips with a report when no OPENAI_API_KEY.
  const embedSweep = await sweepPublishedWithoutEmbeddings(admin, 50);

  // DPDP §8(7) storage limitation. Folded in here rather than given its own
  // schedule because Hobby allows two crons and both are spoken for - and run
  // LAST, with a wall-clock deadline, so a growing sweep can never starve the
  // ingest retry or the embedding backfill above it.
  //
  // Also finishes two things that are not age-on-a-column: deleting accounts
  // refused at the age gate once their 30-day refusal record has done its job,
  // and re-running any withdrawal purge that failed mid-flight.
  const retention = await runRetentionSweep(admin, Date.now(), {
    deadlineMs: Date.now() + 90_000,
  });

  return NextResponse.json({ ingest, embedSweep, retention });
}
