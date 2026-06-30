import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { IMAGE_EXT_MIME, sniffImageExt } from "@/lib/media/image";

/**
 * Uploader for experience story media. Mirrors the place-images flow but targets
 * the public-read `experience-media` bucket (migration 0006) and also accepts
 * short video clips for story cards. Writes go through the service role in the
 * admin place action, which is gated by requireAdmin().
 */

type Admin = SupabaseClient<Database>;

export const EXPERIENCE_MEDIA_BUCKET = "experience-media";

/** Story media can be a short clip, so allow more headroom than a photo. */
export const MAX_EXPERIENCE_MEDIA_BYTES = 50 * 1024 * 1024; // 50MB

export type StoryMediaType = "image" | "video";

// Video bytes are awkward to sniff reliably; uploads here are admin-only
// (requireAdmin), so we accept a small allowlist by Content-Type instead.
const VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/**
 * Validates and uploads one story media file to `${pathPrefix}.<ext>`. Images
 * are identified by magic bytes; videos by an allowlisted Content-Type. Returns
 * the stored path and the resolved media type. Throws on an oversized or
 * unsupported file, or a failed upload.
 */
export async function uploadExperienceMedia(
  admin: Admin,
  pathPrefix: string,
  file: File,
): Promise<{ mediaPath: string; mediaType: StoryMediaType }> {
  if (file.size === 0) throw new Error("Empty media file");
  if (file.size > MAX_EXPERIENCE_MEDIA_BYTES) {
    throw new Error("Story media is too large (max 50MB)");
  }

  const imageExt = await sniffImageExt(file);
  if (imageExt) {
    const path = `${pathPrefix}.${imageExt}`;
    const { error } = await admin.storage
      .from(EXPERIENCE_MEDIA_BUCKET)
      .upload(path, file, {
        contentType: IMAGE_EXT_MIME[imageExt],
        upsert: true,
      });
    if (error) throw new Error(`Story media upload failed: ${error.message}`);
    return { mediaPath: path, mediaType: "image" };
  }

  const videoExt = VIDEO_MIME[file.type];
  if (videoExt) {
    const path = `${pathPrefix}.${videoExt}`;
    const { error } = await admin.storage
      .from(EXPERIENCE_MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true });
    if (error) throw new Error(`Story media upload failed: ${error.message}`);
    return { mediaPath: path, mediaType: "video" };
  }

  throw new Error(
    "Unsupported media (use JPEG/PNG/WebP images or MP4/WebM/MOV video)",
  );
}
