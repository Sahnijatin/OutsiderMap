"use client";

import {
  adminMediaDescriptor,
  adminMediaMime,
  MAX_ADMIN_MEDIA_BYTES,
  MAX_ADMIN_MEDIA_LABEL,
  type AdminMediaKind,
} from "@/lib/media/admin-media";
import { downscaleImage } from "@/lib/media/downscale";

/**
 * The browser half of an admin upload: ask the server for a one-time signed
 * URL, PUT the bytes straight to Storage, hand the caller back the path.
 *
 * Nothing here goes through a Server Action, which is the point - a Server
 * Action body caps out at 4MB and a clip is never that small.
 */

export type AdminUploadTarget =
  | { target: "harvest"; candidateId: string }
  | { target: "story" };

export type UploadedMedia = { path: string; kind: AdminMediaKind };

/** Thrown with a message that is safe to show the reviewer as-is. */
export class AdminUploadError extends Error {}

export async function uploadAdminMedia(
  file: File,
  target: AdminUploadTarget,
): Promise<UploadedMedia> {
  const descriptor = adminMediaDescriptor(file);
  if (!descriptor) {
    throw new AdminUploadError(
      `${file.name}: not a supported file - JPG, PNG, WebP, HEIC, MP4, WebM or MOV.`,
    );
  }

  // Photos shrink in the browser (a 2000px JPEG is indistinguishable in a
  // gallery and uploads in a couple of seconds on mobile data). Video is sent
  // as-is; re-encoding it client-side would cost more than it saves.
  const payload =
    descriptor.kind === "image" ? await downscaleImage(file) : file;

  if (payload.size > MAX_ADMIN_MEDIA_BYTES) {
    throw new AdminUploadError(
      `${file.name} is too big (${MAX_ADMIN_MEDIA_LABEL} max).`,
    );
  }

  // downscaleImage re-encodes HEIC and friends to JPEG, so re-read the
  // extension from whatever we are actually about to send.
  const finalDescriptor = adminMediaDescriptor(payload) ?? descriptor;

  const issued = await fetch("/api/admin/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...target,
      kind: finalDescriptor.kind,
      ext: finalDescriptor.ext,
      size: payload.size,
    }),
  });
  const body = (await issued.json().catch(() => ({}))) as {
    bucket?: string;
    path?: string;
    token?: string;
    message?: string;
  };
  if (!issued.ok || !body.bucket || !body.path || !body.token) {
    throw new AdminUploadError(body.message ?? "Couldn't start the upload.");
  }

  const { createClient } = await import("@/lib/supabase/client");
  const { error } = await createClient()
    .storage.from(body.bucket)
    .uploadToSignedUrl(body.path, body.token, payload, {
      contentType: adminMediaMime(finalDescriptor.ext) ?? payload.type,
    });
  if (error) {
    throw new AdminUploadError(`${file.name}: upload failed - try again.`);
  }

  return { path: body.path, kind: finalDescriptor.kind };
}
