import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  allowedPlacePhotoExt,
  issuePlacePhotoUpload,
  MAX_PENDING_PER_PLACE,
  MAX_PLACE_PHOTO_BYTES,
  placePhotoPath,
  PlacePhotoIssueSchema,
} from "@/lib/media/place-photo";

/**
 * POST - issue a signed direct-to-Storage upload URL so a member can add a
 * photo to a place. The bytes go phone -> Storage; this server only hands out
 * the path and the permission.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(`place-photo:${ctx.user.id}`, 40, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { slug } = await params;
  const parsed = PlacePhotoIssueSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { ext, size } = parsed.data;

  if (!allowedPlacePhotoExt(ext)) {
    return NextResponse.json(
      { error: "unsupported", message: "Photos only - JPG, PNG, WEBP or HEIC." },
      { status: 400 },
    );
  }
  if (size > MAX_PLACE_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "12MB max per photo." },
      { status: 400 },
    );
  }

  // Published places are open to any member. Drafts are visible to admins
  // only, and RLS already enforces that - so an admin curating the imported
  // NCR drafts can attach photos before anything goes live, while a member
  // still cannot reach an unpublished row at all.
  const { data: place } = await ctx.supabase
    .from("places")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!place) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // A cap per person per place: one enthusiastic member should not be able to
  // fill a gallery, and it bounds the review queue.
  const { count } = await ctx.supabase
    .from("place_media")
    .select("id", { count: "exact", head: true })
    .eq("place_id", place.id)
    .eq("contributor_id", ctx.user.id)
    .eq("status", "pending");
  if ((count ?? 0) >= MAX_PENDING_PER_PLACE) {
    return NextResponse.json(
      {
        error: "pending_limit",
        message: "You have photos waiting on this place already.",
      },
      { status: 400 },
    );
  }

  const path = placePhotoPath({
    userId: ctx.user.id,
    placeId: place.id,
    ext,
  });

  try {
    const upload = await issuePlacePhotoUpload(createAdminClient(), path);
    return NextResponse.json({ ...upload, placeId: place.id });
  } catch {
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
