import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { MAX_POST_MEDIA_BYTES } from "@/lib/feed/compose";

/**
 * Post media: like quest capture, phones upload straight to Storage via a
 * signed upload URL (the app server never sees the bytes). Paths are
 * server-issued - p/{user}/{post}/{uuid}.{ext} - so the owner-prefix storage
 * policy and the path can be trusted. Unlike quest-media the bucket is public
 * (feed images/videos are CDN-served), so display uses public URLs.
 */

export const POST_MEDIA_BUCKET = "post-media";

export function postMediaPath(opts: {
  userId: string;
  postId: string;
  ext: string;
}) {
  return `p/${opts.userId}/${opts.postId}/${randomUUID()}.${opts.ext}`;
}

/** Issue a one-time signed upload URL for a server-generated path. */
export async function issuePostUpload(
  admin: SupabaseClient<Database>,
  path: string,
) {
  const { data, error } = await admin.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(error?.message ?? "could not issue upload url");
  }
  return { path: data.path, token: data.token };
}

/**
 * Verify an uploaded object exists and respects the size cap. Returns its
 * size, or null when the object isn't there (client never finished). Removes
 * an over-cap object so it can't linger public.
 */
export async function verifyPostObject(
  admin: SupabaseClient<Database>,
  path: string,
): Promise<{ size: number } | null> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage
    .from(POST_MEDIA_BUCKET)
    .list(dir, { search: name, limit: 1 });
  if (error) throw new Error(error.message);
  const obj = data?.find((o) => o.name === name);
  if (!obj) return null;
  const size = (obj.metadata as { size?: number } | null)?.size ?? 0;
  if (size > MAX_POST_MEDIA_BYTES) {
    await admin.storage.from(POST_MEDIA_BUCKET).remove([path]);
    throw new Error("That file is too large (150MB max).");
  }
  return { size };
}
