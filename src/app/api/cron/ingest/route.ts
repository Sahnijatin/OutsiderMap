import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processIngestItems } from "@/lib/ingest/pipeline";
import { serverEnv } from "@/lib/env";

/** Ingest sweeper: processes queued scout links the inline kick missed. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const report = await processIngestItems(admin, 10);
  return NextResponse.json(report);
}
