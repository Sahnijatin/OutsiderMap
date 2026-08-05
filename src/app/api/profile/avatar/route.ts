import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  allowedAvatarExt,
  avatarPath,
  AvatarIssueSchema,
  issueAvatarUpload,
  MAX_AVATAR_BYTES,
} from "@/lib/media/avatar";

/**
 * POST - issue a signed direct-to-Storage upload URL for the caller's avatar.
 * The bytes go phone -> Storage; this server only hands out the path and the
 * permission, exactly as place photos and post media do.
 *
 * The path is server-issued and owner-prefixed, which is what lets both the
 * storage policy and the confirm route trust it.
 */
export async function POST(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Generous enough for a few retries and a change of mind, tight enough that
  // nobody mints signed URLs in bulk.
  const allowed = await checkRateLimit(`avatar:${ctx.user.id}`, 20, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = AvatarIssueSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { ext, size } = parsed.data;

  if (!allowedAvatarExt(ext)) {
    return NextResponse.json(
      { error: "unsupported", message: "Photos only - JPG, PNG, WEBP or HEIC." },
      { status: 400 },
    );
  }
  if (size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "5MB max." },
      { status: 400 },
    );
  }

  const path = avatarPath({ userId: ctx.user.id, ext });

  try {
    const upload = await issueAvatarUpload(createAdminClient(), path);
    return NextResponse.json(upload);
  } catch {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
