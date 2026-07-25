import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  PLACE_PHOTO_BUCKET,
  placePhotoPrefix,
  PlacePhotoConfirmSchema,
  verifyPlacePhotoObject,
} from "@/lib/media/place-photo";
import { screenPlacePhoto } from "@/lib/moderation/place-photo";

/**
 * POST - the client has PUT its photo to the signed URL. Verify the object
 * landed, screen it, and record the place_media row.
 *
 * The licence basis is set here and only here: `user_upload`, meaning we hold
 * a licence through the terms this member accepted. A contributor cannot
 * choose it, which is what stops "I found this on Instagram" arriving through
 * the door marked "my photo".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = await checkRateLimit(
    `place-photo-confirm:${ctx.user.id}`,
    40,
    3600,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { slug } = await params;
  const parsed = PlacePhotoConfirmSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { path, caption, capturedLat, capturedLng } = parsed.data;

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

  // Paths are server-issued and prefixed with the owner and the place. Only
  // accept one that matches this exact caller and place, so a confirm cannot
  // attach somebody else's object.
  if (!path.startsWith(placePhotoPrefix(ctx.user.id, place.id))) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const admin = createAdminClient();
  let object: { size: number } | null;
  try {
    object = await verifyPlacePhotoObject(admin, path);
  } catch (err) {
    return NextResponse.json(
      { error: "too_large", message: (err as Error).message },
      { status: 400 },
    );
  }
  if (!object) {
    return NextResponse.json(
      { error: "missing", message: "That upload didn't finish." },
      { status: 400 },
    );
  }

  const screening = await screenPlacePhoto(admin, {
    bucket: PLACE_PHOTO_BUCKET,
    path,
    contributorId: ctx.user.id,
  });
  if (screening.status === "removed") {
    // The object is already gone; say no without explaining the detector.
    return NextResponse.json(
      { error: "rejected", message: "That photo can't be added." },
      { status: 400 },
    );
  }

  const { error } = await admin.from("place_media").insert({
    place_id: place.id,
    kind: "image",
    licence_basis: "user_upload",
    storage_path: path,
    contributor_id: ctx.user.id,
    caption: caption || null,
    captured_lat: capturedLat ?? null,
    captured_lng: capturedLng ?? null,
    captured_at: new Date().toISOString(),
    status: screening.status,
  });
  if (error) {
    await admin.storage.from(PLACE_PHOTO_BUCKET).remove([path]);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: screening.status });
}
