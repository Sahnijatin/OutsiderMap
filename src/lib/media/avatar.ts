import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Member avatars.
 *
 * `profiles.avatar_url` has existed since the first migration and has been
 * rendered in the feed, on profiles and in activity ever since - but nothing
 * in the app ever wrote it. Only the OAuth provider did, through
 * handle_new_user. This is the write path.
 *
 * Same shape as place photos and post media: the phone uploads straight to
 * Storage through a signed URL, so the app server never handles the bytes.
 * Paths are server-issued as a/{user}/{uuid}.{ext}, which is what makes
 * (storage.foldername(name))[2] the uploader's id and therefore safe for the
 * bucket policy to trust.
 */

export const AVATAR_BUCKET = "avatars";

/** A face, not a gallery shot - and it is displayed at 96px most of the time. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;

export const AvatarIssueSchema = z.object({
  ext: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]{2,5}$/),
  size: z.number().int().positive().max(MAX_AVATAR_BYTES),
});

export const AvatarConfirmSchema = z.object({
  path: z.string().min(1).max(300),
});

export function allowedAvatarExt(ext: string): boolean {
  return (ALLOWED_EXT as readonly string[]).includes(ext);
}

/** The prefix every one of a member's avatar objects sits under. */
export function avatarPrefix(userId: string) {
  return `a/${userId}/`;
}

export function avatarPath(opts: { userId: string; ext: string }) {
  return `${avatarPrefix(opts.userId)}${randomUUID()}.${opts.ext}`;
}

export async function issueAvatarUpload(
  admin: SupabaseClient<Database>,
  path: string,
) {
  const { data, error } = await admin.storage
    .from(AVATAR_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(error?.message ?? "could not issue upload url");
  }
  return { path: data.path, token: data.token };
}

/**
 * Confirm the object landed and is within the cap. Returns its size, or null
 * when the client never finished the PUT. An over-cap object is removed rather
 * than left sitting in a public bucket.
 */
export async function verifyAvatarObject(
  admin: SupabaseClient<Database>,
  path: string,
): Promise<{ size: number } | null> {
  const cut = path.lastIndexOf("/");
  const dir = path.slice(0, cut);
  const name = path.slice(cut + 1);

  const { data, error } = await admin.storage
    .from(AVATAR_BUCKET)
    .list(dir, { search: name, limit: 1 });
  if (error) throw new Error(error.message);

  const obj = data?.find((o) => o.name === name);
  if (!obj) return null;

  const size = (obj.metadata as { size?: number } | null)?.size ?? 0;
  if (size > MAX_AVATAR_BYTES) {
    await admin.storage.from(AVATAR_BUCKET).remove([path]);
    throw new Error("That photo is too large (5MB max).");
  }
  return { size };
}

/**
 * The public URL for a stored avatar. The bucket is public - avatars already
 * render on the anonymous profile route - so this is derivable rather than
 * signed, and `avatar_url` can hold it directly.
 */
export function avatarPublicUrl(supabaseUrl: string, path: string) {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

/**
 * Remove a member's other avatar objects after a new one is confirmed.
 * Best-effort: a leftover object is wasted bytes, not a broken profile.
 */
export async function pruneOldAvatars(
  admin: SupabaseClient<Database>,
  userId: string,
  keepPath: string,
) {
  const { data } = await admin.storage
    .from(AVATAR_BUCKET)
    .list(avatarPrefix(userId).replace(/\/$/, ""), { limit: 100 });
  const stale = (data ?? [])
    .map((o) => `${avatarPrefix(userId)}${o.name}`)
    .filter((p) => p !== keepPath);
  if (stale.length > 0) {
    await admin.storage.from(AVATAR_BUCKET).remove(stale);
  }
}
