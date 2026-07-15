import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Quest capture media: phones upload straight to the private quest-media
 * bucket via signed upload URLs (Vercel's request-body limit never sees the
 * bytes). Paths are server-issued - q/{user}/{quest}/{stop}/{uuid}.{ext} -
 * so the owner-prefix storage policies and the path itself can be trusted.
 */

export const QUEST_MEDIA_BUCKET = "quest-media";
export const MAX_QUEST_MEDIA_BYTES = 150 * 1024 * 1024; // 150MB per clip
export const MAX_MEDIA_PER_STOP = 12;

const IMAGE_EXTS = ["jpg", "png", "webp"] as const;
const VIDEO_EXTS = ["mp4", "webm", "mov"] as const;

export type QuestMediaKind = "image" | "video";

export function allowedExt(kind: QuestMediaKind, ext: string): boolean {
  return kind === "image"
    ? (IMAGE_EXTS as readonly string[]).includes(ext)
    : (VIDEO_EXTS as readonly string[]).includes(ext);
}

export function questMediaPath(opts: {
  userId: string;
  questId: string;
  stopId: string;
  ext: string;
}) {
  return `q/${opts.userId}/${opts.questId}/${opts.stopId}/${randomUUID()}.${opts.ext}`;
}

/** Issue a one-time signed upload URL for a server-generated path. */
export async function issueQuestUpload(
  admin: SupabaseClient<Database>,
  path: string,
) {
  const { data, error } = await admin.storage
    .from(QUEST_MEDIA_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(error?.message ?? "could not issue upload url");
  }
  return { path: data.path, token: data.token };
}

/**
 * Verify an uploaded object exists and respects the size cap. Returns its
 * size, or null when the object isn't there (client never finished).
 */
export async function verifyQuestObject(
  admin: SupabaseClient<Database>,
  path: string,
): Promise<{ size: number } | null> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage
    .from(QUEST_MEDIA_BUCKET)
    .list(dir, { search: name, limit: 1 });
  if (error) throw new Error(error.message);
  const obj = data?.find((o) => o.name === name);
  if (!obj) return null;
  const size = (obj.metadata as { size?: number } | null)?.size ?? 0;
  if (size > MAX_QUEST_MEDIA_BYTES) {
    await admin.storage.from(QUEST_MEDIA_BUCKET).remove([path]);
    throw new Error("That file is too large (150MB max).");
  }
  return { size };
}

/** Short-lived display URLs for the owner's own captures. */
export async function signQuestMediaUrls(
  admin: SupabaseClient<Database>,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await admin.storage
    .from(QUEST_MEDIA_BUCKET)
    .createSignedUrls(paths, 3600);
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  }
  return out;
}
