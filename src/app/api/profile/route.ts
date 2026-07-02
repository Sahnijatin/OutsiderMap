import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * The member's profile screen: the system's read on their taste (the wow
 * moment) plus the personalization consent toggle. RLS scopes both reads and
 * the write to the caller.
 */
export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`profile:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const [{ data: profile }, { data: taste }] = await Promise.all([
    ctx.supabase
      .from("profiles")
      .select(
        "display_name, avatar_url, home_area, personalization_enabled, onboarding_completed_at",
      )
      .eq("id", ctx.user.id)
      .maybeSingle(),
    ctx.supabase
      .from("taste_profiles")
      .select("taste_summary, learned_signals, version, updated_at")
      .eq("user_id", ctx.user.id)
      .maybeSingle(),
  ]);

  return NextResponse.json({ profile, taste });
}

const PatchSchema = z.object({ personalization_enabled: z.boolean() });

export async function PATCH(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`profile:${ctx.user.id}`, 60, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ personalization_enabled: parsed.data.personalization_enabled })
    .eq("id", ctx.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
