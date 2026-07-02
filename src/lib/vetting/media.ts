import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { IMAGE_EXT_MIME, sniffImageExt } from "@/lib/media/image";

/**
 * Shared helpers for member-vetting media (selfies + photos).
 *
 * These images are sensitive PII (India DPDP Act), so they live in the PRIVATE
 * `member-vetting` bucket created in migration 0007: no public-read policy means
 * default-deny, and only the service role (admins) may read or write them.
 *
 * The write path (the /join application, B2) and the read path (the admin
 * vetting queue, B3) both go through here so the bucket name, size cap, and
 * byte-sniffing rules live in exactly one place.
 */

type Admin = SupabaseClient<Database>;

/** Private bucket holding selfies + photos for member vetting (migration 0007). */
export const MEMBER_VETTING_BUCKET = "member-vetting";

/** Cap on a single vetting image. Applicants upload phone photos. */
export const MAX_VETTING_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

/**
 * Validates and uploads one image to the private member-vetting bucket under
 * `${pathPrefix}.<ext>` (the extension comes from the sniffed bytes). Returns
 * the stored object path. Throws on an oversized file, non-image bytes, or a
 * failed upload so the caller can decide how to surface it.
 */
export async function putVettingImage(
  admin: Admin,
  pathPrefix: string,
  file: File,
): Promise<string> {
  if (file.size === 0) throw new Error("Empty image file");
  if (file.size > MAX_VETTING_IMAGE_BYTES) {
    throw new Error("Image is too large");
  }
  const ext = await sniffImageExt(file);
  if (!ext) throw new Error("File is not a supported image");

  const path = `${pathPrefix}.${ext}`;
  const { error } = await admin.storage
    .from(MEMBER_VETTING_BUCKET)
    .upload(path, file, { contentType: IMAGE_EXT_MIME[ext], upsert: true });
  if (error) throw new Error(`Vetting image upload failed: ${error.message}`);
  return path;
}

/**
 * Mints a short-lived signed URL for one object in the private bucket so an
 * admin can view it in the vetting queue. Returns null when the path is empty
 * or the object can't be signed (e.g. missing), so callers can skip it.
 */
export async function signVettingUrl(
  admin: Admin,
  path: string | null | undefined,
  expiresInSeconds = 300,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage
    .from(MEMBER_VETTING_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Batch variant preserving input order. Each entry pairs the original path with
 * its signed URL (null when it couldn't be signed). Empty input short-circuits.
 */
export async function signVettingUrls(
  admin: Admin,
  paths: readonly string[],
  expiresInSeconds = 300,
): Promise<Array<{ path: string; signedUrl: string | null }>> {
  if (paths.length === 0) return [];
  const { data, error } = await admin.storage
    .from(MEMBER_VETTING_BUCKET)
    .createSignedUrls(paths as string[], expiresInSeconds);
  if (error || !data) {
    return paths.map((path) => ({ path, signedUrl: null }));
  }
  // createSignedUrls returns results in request order; map defensively by index.
  return paths.map((path, i) => ({
    path,
    signedUrl: data[i]?.error ? null : (data[i]?.signedUrl ?? null),
  }));
}
