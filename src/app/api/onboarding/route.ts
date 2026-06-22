import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
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
