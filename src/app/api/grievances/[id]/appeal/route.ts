import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * POST /api/grievances/[id]/appeal - appeal a closed grievance to the Grievance
 * Appellate Committee (IT Rules 2021, 30-day window). The transition runs
 * through the security-definer appeal_grievance RPC, which pins it to the
 * reporter's own grievance, a closed status, and the window; the GAC then
 * upholds/overturns from /admin/grievances.
 */
const IdSchema = z.string().uuid();

// Postgres SQLSTATE → HTTP status for the RPC's raised errors.
const STATUS_BY_CODE: Record<string, number> = {
  P0002: 404, // no_data_found - grievance missing
  "42501": 403, // insufficient_privilege - not the reporter's grievance
  "23514": 400, // check_violation - not closed / window passed
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`grievance-appeal:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { error } = await ctx.supabase.rpc("appeal_grievance", { p_id: id });
  if (error) {
    const status = STATUS_BY_CODE[error.code ?? ""] ?? 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true, status: "appealed" });
}
