import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { listNearbyBounties } from "@/lib/scout/bounties";

/**
 * GET /api/bounties?city=&area= - open verification bounties near the member,
 * filterable by area. Blind: the lister's identity is never returned.
 * Eligibility to actually confirm is enforced when a confirmation is submitted.
 */
export async function GET(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`bounties-list:${ctx.user.id}`, 120, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(request.url);
  const city = url.searchParams.get("city") ?? undefined;
  const area = url.searchParams.get("area") ?? undefined;

  try {
    const bounties = await listNearbyBounties(ctx.supabase, { city, area });
    return NextResponse.json({ ok: true, bounties });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
