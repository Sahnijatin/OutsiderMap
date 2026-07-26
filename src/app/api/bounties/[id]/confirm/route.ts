import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createCsamScanner, quarantineAndReport } from "@/lib/moderation/csam";
import { submitConfirmation } from "@/lib/scout/bounties";
import {
  SCOUT_EVIDENCE_BUCKET,
  isLiveCapture,
  scoutEvidencePrefix,
} from "@/lib/scout/capture";
import { verifyQuestObject } from "@/lib/media/quest";

/**
 * POST /api/bounties/[id]/confirm - submit an on-site verification.
 *
 * Evidence must be a live camera capture (never a gallery pick), and the
 * {bucket, path} pair is never trusted as sent: the bucket must be the scout
 * evidence bucket, the path must sit under this caller's owner prefix
 * (mirroring places/[slug]/photos/confirm), and the object must actually
 * exist. Only that validated reference reaches the CSAM screen - so a
 * moderation hit can quarantine (service-role delete + report) nothing but
 * the caller's own upload. The RPC then computes geo_ok / independence_ok /
 * anomaly server-side and re-aggregates.
 */
const MediaSchema = z.object({
  source: z.literal("camera"),
  bucket: z.literal(SCOUT_EVIDENCE_BUCKET),
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
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
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

  // Evidence paths are client-uploaded but owner-prefixed (storage RLS
  // enforces the prefix on insert). Accept only a path under THIS caller's
  // prefix, so a confirmation can never claim - or later quarantine/delete -
  // anybody else's object.
  if (!input.media.path.startsWith(scoutEvidencePrefix(ctx.user.id))) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // The upload must have actually landed (and be within the size cap) before
  // it can count as evidence.
  const admin = createAdminClient();
  let uploaded: { size: number } | null;
  try {
    uploaded = await verifyQuestObject(admin, input.media.path);
  } catch (err) {
    return NextResponse.json(
      { error: "too_large", message: (err as Error).message },
      { status: 400 },
    );
  }
  if (!uploaded) {
    return NextResponse.json(
      { error: "missing", message: "That upload didn't finish." },
      { status: 400 },
    );
  }

  // Mandatory CSAM screen before the evidence is ever recorded (#70/#85).
  // `ref` is built from the constant bucket + the validated caller-owned path
  // above - quarantineAndReport can only ever act on that object.
  const ref = {
    bucket: SCOUT_EVIDENCE_BUCKET,
    path: input.media.path,
    kind: input.media.kind,
  };
  const match = await createCsamScanner().scan(ref);
  if (match.hit) {
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
