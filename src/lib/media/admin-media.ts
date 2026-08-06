/**
 * What an admin is allowed to upload, and how a picked file maps onto a
 * storage extension. Pure - imported by the browser components that pick the
 * files and by the route handler that issues the signed upload URL, so the two
 * sides can never drift.
 *
 * Admin media goes straight to Storage through a signed URL rather than
 * through a Server Action. A Server Action request body is capped at 4MB
 * (Vercel stops at 4.5MB regardless of config), which is under the size of a
 * single second of phone video - that cap is why video "didn't work" on every
 * admin surface. Signed uploads never touch the app server.
 */

import { resolveMediaDescriptor } from "@/lib/media/file-kind";

export type AdminMediaKind = "image" | "video";

export const ADMIN_IMAGE_EXTS = ["jpg", "png", "webp", "heic", "heif"] as const;
export const ADMIN_VIDEO_EXTS = ["mp4", "webm", "mov", "m4v"] as const;

/** Matches the bucket ceilings set in migration 57. */
export const MAX_ADMIN_MEDIA_BYTES = 50 * 1024 * 1024; // 50MB

/** Human-readable cap, for the copy next to the picker. */
export const MAX_ADMIN_MEDIA_LABEL = "50MB";

/** How many files one "Upload data" click may carry. */
export const MAX_ADMIN_MEDIA_BATCH = 12;

export function allowedAdminMediaExt(kind: AdminMediaKind, ext: string): boolean {
  const list: readonly string[] =
    kind === "image" ? ADMIN_IMAGE_EXTS : ADMIN_VIDEO_EXTS;
  return list.includes(ext);
}

/**
 * Content-Type to store the object under. Derived from the extension rather
 * than from `File.type`, because Android hands back an empty string or
 * `application/octet-stream` often enough that trusting it means videos land
 * as downloads instead of playing in a `<video>` tag.
 */
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function adminMediaMime(ext: string): string | undefined {
  return EXT_MIME[ext];
}

/** Best-effort {kind, ext} for a picked file, or null when we don't accept it. */
export function adminMediaDescriptor(
  file: { name: string; type: string },
): { kind: AdminMediaKind; ext: string } | null {
  return resolveMediaDescriptor(file, allowedAdminMediaExt);
}
