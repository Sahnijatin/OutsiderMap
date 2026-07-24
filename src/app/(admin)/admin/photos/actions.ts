"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLACE_PHOTO_BUCKET } from "@/lib/media/place-photo";

const IdSchema = z.string().uuid();

/** Publish a contributed photo. This is what makes it visible to everyone. */
export async function publishPlacePhoto(formData: FormData) {
  await requireAdmin();
  const id = IdSchema.parse(formData.get("id"));

  const admin = createAdminClient();
  await admin
    .from("place_media")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");

  revalidatePath("/admin/photos");
}

/**
 * Reject a contributed photo: retire the row and delete the object.
 *
 * The row is kept (status 'removed') rather than deleted so a pattern of
 * rejections against one contributor is visible later. The file itself goes,
 * because it sits in a public bucket.
 */
export async function rejectPlacePhoto(formData: FormData) {
  await requireAdmin();
  const id = IdSchema.parse(formData.get("id"));
  const reason = z
    .string()
    .trim()
    .max(200)
    .parse(formData.get("reason") ?? "not suitable");

  const admin = createAdminClient();
  const { data: media } = await admin
    .from("place_media")
    .select("id, storage_path, status")
    .eq("id", id)
    .maybeSingle();
  if (!media || media.status === "removed") return;

  if (media.storage_path) {
    await admin.storage.from(PLACE_PHOTO_BUCKET).remove([media.storage_path]);
  }
  await admin
    .from("place_media")
    .update({
      status: "removed",
      removed_reason: reason,
      removed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/photos");
}
