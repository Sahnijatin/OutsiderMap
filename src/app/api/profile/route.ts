import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { normalizeFollowState } from "@/lib/feed/follows";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordConsent } from "@/lib/consent/record";
import { purgeTargets } from "@/lib/consent/purposes";
import { purgeDerivedData } from "@/lib/consent/withdraw";

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

  const [{ data: profile }, { data: taste }, { data: follow }] =
    await Promise.all([
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
      ctx.supabase.rpc("follow_state", { target: ctx.user.id }),
    ]);

  return NextResponse.json({
    profile,
    taste,
    follows: normalizeFollowState(follow?.[0]),
  });
}

const PatchSchema = z.object({ personalization_enabled: z.boolean() });

/**
 * Kept for the native builds already in the wild, which know this shape and
 * nothing else. It no longer writes the column directly - migration 58 revoked
 * that grant, and only the consents trigger writes personalization_enabled
 * now. Everything routes through the same consent path as PATCH /api/consent,
 * so no caller can flip the switch without leaving a record or paying the
 * withdrawal cost.
 */
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
  const granted = parsed.data.personalization_enabled;

  const { error } = await recordConsent(ctx.supabase, {
    purpose: "personalization",
    granted,
    method: "settings_toggle",
    source: { route: "PATCH /api/profile" },
  });
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  if (granted) return NextResponse.json({ ok: true });

  const purge = await purgeDerivedData(
    createAdminClient(),
    ctx.user.id,
    purgeTargets("personalization"),
  );
  if (purge.errors.length > 0) {
    return NextResponse.json(
      { error: "withdraw incomplete", details: purge.errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
