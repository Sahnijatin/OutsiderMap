import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * DPDP §14: the right to nominate someone to exercise your rights.
 *
 * This records a declaration and nothing more. The nominee cannot sign in,
 * cannot make requests, and is not verified here - they act by contacting the
 * grievance officer, who checks the claim against this row. An unverified
 * nominee record that behaved like an access path would be an account takeover
 * route wearing a compliance badge, and /privacy says exactly what this is.
 */

const NomineeSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    relationship: z.string().trim().max(60).optional(),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(6).max(20).optional(),
    note: z.string().trim().max(500).optional(),
  })
  // Mirrors the nominees_reachable check constraint: a nominee nobody can
  // reach is not a nomination.
  .refine((v) => Boolean(v.email || v.phone), {
    message: "an email or a phone number is required",
  });

export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await ctx.supabase
    .from("nominees")
    .select("*")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ nominee: data ?? null });
}

export async function PUT(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`nominee:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = NomineeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // One nominee per member: a second is a replacement, not an addition, which
  // keeps "who did they nominate" a question with one answer.
  const { error } = await ctx.supabase.from("nominees").upsert(
    {
      user_id: ctx.user.id,
      name: parsed.data.name,
      relationship: parsed.data.relationship ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      note: parsed.data.note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await ctx.supabase
    .from("nominees")
    .delete()
    .eq("user_id", ctx.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
