import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

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

const EXT_MIME = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type ImageExt = keyof typeof EXT_MIME;

/**
 * Identifies an image by its magic bytes, not the client-supplied MIME type -
 * uploads are user-controlled, so we must not trust the caller's Content-Type.
 * Returns the canonical extension, or null if the bytes aren't an allowed image.
 */
export async function sniffImageExt(file: File): Promise<ImageExt | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "png";
  // WEBP: "RIFF"...."WEBP"
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "webp";
  return null;
}

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
    .upload(path, file, { contentType: EXT_MIME[ext], upsert: true });
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
