import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  allowedAdminMediaExt,
  MAX_ADMIN_MEDIA_BYTES,
} from "@/lib/media/admin-media";

/**
 * Signed direct-to-Storage upload URLs for the curation desk.
 *
 * Admin photo and video uploads used to ride a Server Action request body,
 * which is capped at 4MB - so a photo sometimes worked and a video never did.
 * The desk now asks here for a one-time signed URL, PUTs the bytes straight to
 * Supabase Storage, and calls a Server Action with just the resulting path.
 *
 * The client never names its own bucket or path: it names a *target*, and the
 * server derives both. That is what keeps a signed URL from becoming a write
 * primitive for anywhere in Storage.
 */

const BodySchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("harvest"),
    candidateId: z.string().uuid(),
    kind: z.enum(["image", "video"]),
    ext: z.string().trim().toLowerCase().regex(/^[a-z0-9]{2,5}$/),
    size: z.number().int().positive(),
  }),
  z.object({
    target: z.literal("story"),
    kind: z.enum(["image", "video"]),
    ext: z.string().trim().toLowerCase().regex(/^[a-z0-9]{2,5}$/),
    size: z.number().int().positive(),
  }),
]);

export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The (admin) layout gates the pages; this route is reachable on its own, so
  // it re-checks rather than trusting where the call came from.
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", ctx.user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const allowed = await checkRateLimit(`admin-media:${ctx.user.id}`, 300, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const body = parsed.data;

  if (!allowedAdminMediaExt(body.kind, body.ext)) {
    return NextResponse.json(
      {
        error: "unsupported",
        message:
          "That file type isn't supported - JPG, PNG, WebP, HEIC, MP4, WebM or MOV.",
      },
      { status: 400 },
    );
  }
  if (body.size > MAX_ADMIN_MEDIA_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "50MB max per file." },
      { status: 400 },
    );
  }

  const bucket = body.target === "harvest" ? "place-images" : "experience-media";
  const path =
    body.target === "harvest"
      ? `harvest/${body.candidateId}/${randomUUID()}.${body.ext}`
      : `experiences/uploads/${randomUUID()}.${body.ext}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { error: "issue_failed", message: error?.message ?? "Couldn't start the upload." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    bucket,
    path: data.path,
    token: data.token,
    kind: body.kind,
  });
}
