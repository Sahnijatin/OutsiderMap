import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";

/**
 * POST /api/tour - marks the guided tour served.
 *
 * Finishing, skipping, pressing Escape and the give-up path all call this,
 * because all four mean the same thing: never show this unprompted again.
 *
 * A route handler rather than a server action, because getApiContext is
 * dual-mode (Bearer for the Capacitor client, cookies for web) while server
 * actions are cookie-only - the tour runs in the native app too, and a server
 * action would silently fail to persist there.
 *
 * `.is("tour_completed_at", null)` makes it once-only (the claimUsername
 * idiom), so replaying from profile settings never overwrites the first
 * timestamp - that one is the funnel fact worth keeping. RLS
 * ("profiles: owner can update") is the whole guard; this uses the
 * user-scoped client, never the admin one.
 */
export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`tour:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // No after() here: unlike /api/activation there is no payload to return
  // promptly, so a 200 should honestly mean "persisted".
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ tour_completed_at: new Date().toISOString() })
    .eq("id", ctx.user.id)
    .is("tour_completed_at", null);

  if (error) {
    console.error("tour completion failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
