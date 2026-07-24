import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * POST /api/grievances - file a formal grievance (IT Rules 2021). The
 * Grievance Officer works these from /admin/grievances against statutory SLAs.
 * RLS pins reporter_id = self; the SLA clock starts at received_at.
 */
const GrievanceSchema = z.object({
  category: z.string().trim().min(1).max(60),
  body: z.string().trim().max(4000).optional(),
  target_type: z.string().trim().max(40).optional(),
  target_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`grievance:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = GrievanceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from("grievances")
    .insert({
      reporter_id: ctx.user.id,
      category: parsed.data.category,
      body: parsed.data.body ?? null,
      target_type: parsed.data.target_type ?? null,
      target_id: parsed.data.target_id ?? null,
    })
    .select("id, status, received_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, grievance: data }, { status: 201 });
}
