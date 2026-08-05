import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { AnswersSchema, runOnboarding } from "@/lib/taste/onboarding";
import { needsReconsent } from "@/lib/consent/policy";

/**
 * Mobile onboarding: submit quiz answers, run the taste pipeline. HTTP twin of
 * the `completeOnboarding` server action (web redirects; here we just 200).
 */
export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The pipeline runs LLM extract + summary + embedding - the costliest
  // endpoint per call, and one a member only legitimately hits a few times.
  const allowed = await checkRateLimit(`onboarding:${ctx.user.id}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // The DPDP gate, mirrored from /setup. The notice, the age check and the
  // itemized consent are a web screen; without this a native client could post
  // straight here and start building a taste profile for someone we never
  // asked - including a child, which is the bypass §9 exists to prevent.
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("blocked_at, age_verified_at, policy_version_accepted")
    .eq("id", ctx.user.id)
    .maybeSingle();

  if (profile?.blocked_at) {
    return NextResponse.json({ error: "blocked" }, { status: 403 });
  }
  if (!profile?.age_verified_at) {
    // POST /api/account/age is the twin that clears this.
    return NextResponse.json({ error: "age_unverified" }, { status: 403 });
  }
  if (needsReconsent(profile.policy_version_accepted)) {
    return NextResponse.json({ error: "notice_required" }, { status: 403 });
  }

  const parsed = AnswersSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    await runOnboarding(ctx.supabase, ctx.user.id, parsed.data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "onboarding failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
