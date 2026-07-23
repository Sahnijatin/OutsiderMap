import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createCsamScanner, quarantineAndReport } from "@/lib/moderation/csam";
import { submitConfirmation } from "@/lib/scout/bounties";
import { isLiveCapture } from "@/lib/scout/capture";

/**
 * POST /api/bounties/[id]/confirm — submit an on-site verification.
 *
 * Evidence must be a live camera capture (never a gallery pick). Media is
 * screened through the mandatory CSAM scan (#70) before the vote is recorded;
 * a hit is quarantined + reported and the confirmation is refused. The RPC then
 * computes geo_ok / independence_ok / anomaly server-side and re-aggregates.
 */
const MediaSchema = z.object({
  source: z.literal("camera"),
  bucket: z.string().min(1).max(64),
  path: z.string().min(1).max(300),
  kind: z.enum(["image", "video"]).default("image"),
});

const BodySchema = z.object({
  verdict: z.enum(["exists", "not_exists"]),
  quality: z.number().int().min(1).max(5).optional(),
  media: MediaSchema,
  capturedLat: z.number().gte(-90).lte(90),
  capturedLng: z.number().gte(-180).lte(180),
  capturedAt: z.string().datetime(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`bounty-confirm:${ctx.user.id}`, 40, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const input = parsed.data;

  if (!isLiveCapture(input.media)) {
    return NextResponse.json(
      { error: "live_capture_required" },
      { status: 400 },
    );
  }

  // Mandatory CSAM screen before the evidence is ever recorded (#70/#85).
  const ref = {
    bucket: input.media.bucket,
    path: input.media.path,
    kind: input.media.kind,
  };
  const match = await createCsamScanner().scan(ref);
  if (match.hit) {
    const admin = createAdminClient();
    await quarantineAndReport(admin, ref, match.source ?? "csam");
    return NextResponse.json({ error: "media_rejected" }, { status: 422 });
  }

  try {
    const confirmationId = await submitConfirmation(ctx.supabase, {
      bountyId: id,
      verdict: input.verdict,
      quality: input.quality ?? null,
      media: {
        source: input.media.source,
        bucket: input.media.bucket,
        path: input.media.path,
        kind: input.media.kind,
      },
      capturedLat: input.capturedLat,
      capturedLng: input.capturedLng,
      capturedAt: input.capturedAt,
    });
    return NextResponse.json({ ok: true, confirmation_id: confirmationId });
  } catch (e) {
    // Eligibility / independence / duplicate-vote failures surface here.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 400 },
    );
  }
}
