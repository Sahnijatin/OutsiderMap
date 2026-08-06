import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  adultGateStatus,
  requireAdultApiContext,
} from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { reportCaseSeverity } from "@/lib/moderation/reports";

/**
 * POST /api/reports - file a content report. Intake only; the review queue and
 * resolution live in the UGC-moderation epic (#70), which reads this table.
 */
const ReportSchema = z.object({
  target_type: z.enum(["post", "comment", "profile"]),
  target_id: z.string().uuid(),
  reason: z.string().trim().max(1000).optional(),
});

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
  const allowed = await checkRateLimit(`report:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = ReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // RLS with-check pins reporter_id = self.
  const { error } = await ctx.supabase.from("content_reports").insert({
    reporter_id: ctx.user.id,
    target_type: parsed.data.target_type,
    target_id: parsed.data.target_id,
    reason: parsed.data.reason ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Open a moderation case for the reported target (service role) if one isn't
  // already open, so every report - including a report of a *person* - lands in
  // the review queue. Person-reports get a higher base severity (priority
  // review) and carry the reported user as author_id so the reviewer's
  // warn/mute/ban acts on them directly. Best-effort: the report is recorded
  // regardless.
  const { target_type, target_id, reason } = parsed.data;
  try {
    const admin = createAdminClient();
    const { data: open } = await admin
      .from("moderation_cases")
      .select("id, severity")
      .eq("target_type", target_type)
      .eq("target_id", target_id)
      .is("resolved_at", null)
      .maybeSingle();
    if (open) {
      // Another report on an open case bumps its queue priority.
      await admin
        .from("moderation_cases")
        .update({ severity: Math.min(100, (open.severity ?? 0) + 10) })
        .eq("id", open.id);
    } else {
      await admin.from("moderation_cases").insert({
        target_type,
        target_id,
        source: "report",
        decision: "needs_review",
        severity: reportCaseSeverity(target_type),
        reason: reason ?? null,
        ...(target_type === "profile" ? { author_id: target_id } : {}),
      });
    }
  } catch (err) {
    console.error("report: failed to open moderation case", err);
  }

  return NextResponse.json({ ok: true });
}
