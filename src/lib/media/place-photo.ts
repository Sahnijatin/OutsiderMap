import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Member-contributed place photos.
 *
 * Same shape as post media: the phone uploads straight to Storage through a
 * signed URL, so the app server never handles the bytes. Paths are
 * server-issued as c/{user}/{place}/{uuid}.{ext}, which is what makes the
 * storage owner-prefix policy meaningful and lets the confirm route trust that
 * a path belongs to the caller.
 *
 * Photos only. A place gallery wants a good picture of the room, and video
 * brings transcoding, posters and a much larger moderation surface for very
 * little gain here - reels come in as embeds instead.
 */

export const PLACE_PHOTO_BUCKET = "place-images";

/** Big enough for a modern phone photo, small enough to stay a photo. */
export const MAX_PLACE_PHOTO_BYTES = 12 * 1024 * 1024;

/** How many pending contributions one person may have on one place. */
export const MAX_PENDING_PER_PLACE = 3;

const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;

export const PlacePhotoIssueSchema = z.object({
  ext: z.string().trim().toLowerCase().regex(/^[a-z0-9]{2,5}$/),
  size: z.number().int().positive(),
});

export const PlacePhotoConfirmSchema = z.object({
  path: z.string().min(1).max(300),
  caption: z.string().trim().max(140).optional(),
  /** Where the phone was when the shot was taken, when it will tell us. */
  capturedLat: z.number().min(-90).max(90).optional(),
  capturedLng: z.number().min(-180).max(180).optional(),
});

export function allowedPlacePhotoExt(ext: string): boolean {
  return (ALLOWED_EXT as readonly string[]).includes(ext);
}

export function placePhotoPath(opts: {
  userId: string;
  placeId: string;
  ext: string;
}) {
  return `c/${opts.userId}/${opts.placeId}/${randomUUID()}.${opts.ext}`;
}

/** The prefix a given user's uploads for a given place must sit under. */
export function placePhotoPrefix(userId: string, placeId: string) {
  return `c/${userId}/${placeId}/`;
}

export async function issuePlacePhotoUpload(
  admin: SupabaseClient<Database>,
  path: string,
) {
  const { data, error } = await admin.storage
    .from(PLACE_PHOTO_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(error?.message ?? "could not issue upload url");
  }
  return { path: data.path, token: data.token };
}

/**
 * Confirm the object actually landed and is within the cap. Returns its size,
 * or null when the client never finished the PUT. An over-cap object is
 * removed rather than left sitting in a public bucket.
 */
export async function verifyPlacePhotoObject(
  admin: SupabaseClient<Database>,
  path: string,
): Promise<{ size: number } | null> {
  const cut = path.lastIndexOf("/");
  const dir = path.slice(0, cut);
  const name = path.slice(cut + 1);

  const { data, error } = await admin.storage
    .from(PLACE_PHOTO_BUCKET)
    .list(dir, { search: name, limit: 1 });
  if (error) throw new Error(error.message);

  const obj = data?.find((o) => o.name === name);
  if (!obj) return null;

  const size = (obj.metadata as { size?: number } | null)?.size ?? 0;
  if (size > MAX_PLACE_PHOTO_BYTES) {
    await admin.storage.from(PLACE_PHOTO_BUCKET).remove([path]);
    throw new Error("That photo is too large (12MB max).");
  }
  return { size };
}
