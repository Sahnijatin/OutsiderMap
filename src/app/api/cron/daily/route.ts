import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processIngestItems } from "@/lib/ingest/pipeline";
import { sweepPublishedWithoutEmbeddings } from "@/lib/admin/embed-sweep";
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

  return NextResponse.json({ ingest, embedSweep });
}
