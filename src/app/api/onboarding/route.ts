import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { AnswersSchema, runOnboarding } from "@/lib/taste/onboarding";

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
