import { NextResponse, after, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import {
  adultGateStatus,
  requireAdultApiContext,
} from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { processIngestItems } from "@/lib/ingest/pipeline";
import { normalizeSubmission, SubmissionSchema } from "@/lib/ingest/submit";

/**
 * POST /api/submissions - the street-easy way to drop a spot: a Google Maps
 * link OR just a name, plus an optional comment. The submission becomes an
 * ingest_items row (seeded with the member's context) and the existing
 * pipeline does the research; nothing publishes without an admin.
 *
 * The response is instant on purpose - the person is mid-conversation on a
 * street. Enrichment runs after the response via the ingest processor.
 */
export async function POST(request: NextRequest) {
  // Age gate (DPDP §9). This route writes with the service role, which has
  // BYPASSRLS, so the is_active_member() policies from migration 58 never see
  // it - the check has to happen here.
  const gate = await requireAdultApiContext(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      { status: adultGateStatus(gate.error) },
    );
  }
  const ctx = gate.ctx;

  // Generous enough for a scouting walk, tight enough to stop a script.
  const allowed = await checkRateLimit(`submit:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "That's a lot of spots - give it a few minutes." },
      { status: 429 },
    );
  }

  const parsed = SubmissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", message: "Give a link or a name - either works." },
      { status: 400 },
    );
  }

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("home_city")
    .eq("id", ctx.user.id)
    .maybeSingle();

  const { url, sourceType, seed } = normalizeSubmission(parsed.data, {
    id: randomUUID(),
    city: profile?.home_city,
  });

  // Service role: ingest_items is admin-only under RLS by design - members
  // write through this validated, rate-limited path only.
  const admin = createAdminClient();
  const { error } = await admin.from("ingest_items").upsert(
    {
      url,
      source_type: sourceType,
      created_by: ctx.user.id,
      raw_metadata: seed,
    },
    // Same link already submitted: fine - it's on the radar; don't error at
    // the person standing on the street.
    { onConflict: "url", ignoreDuplicates: true },
  );
  if (error) {
    console.error(
      "[submissions] insert failed",
      JSON.stringify({ userId: ctx.user.id, message: error.message }),
    );
    return NextResponse.json(
      { error: "submit_failed", message: "Couldn't save that one - try again in a bit." },
      { status: 500 },
    );
  }

  after(async () => {
    try {
      await processIngestItems(admin, 2);
    } catch (err) {
      console.error("[submissions] enrichment kick failed", err);
    }
  });

  return NextResponse.json({ ok: true });
}
