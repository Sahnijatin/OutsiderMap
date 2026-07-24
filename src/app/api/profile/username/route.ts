import { NextResponse } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { UsernameSchema } from "@/lib/identity/username";

/**
 * GET /api/profile/username?u=some_name - availability check for the setup
 * flow. Advisory only: the claim action re-checks under the unique index.
 */
export async function GET(request: Request) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`username:${ctx.user.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const raw = new URL(request.url).searchParams.get("u") ?? "";
  const parsed = UsernameSchema.safeParse(raw);
  if (!parsed.success) {
    // Reserved or malformed names read as unavailable.
    return NextResponse.json({ available: false });
  }

  const { data, error } = await ctx.supabase.rpc("username_available", {
    candidate: parsed.data,
  });
  if (error) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
  return NextResponse.json({ available: data === true });
}
