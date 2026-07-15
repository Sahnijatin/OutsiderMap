"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ModerateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

/** Approve/reject a reel for the public feed. */
export async function moderateReel(formData: FormData) {
  await requireAdmin();
  const input = ModerateSchema.parse({
    id: formData.get("id"),
    status: formData.get("status"),
  });

  const admin = createAdminClient();
  const { error } = await admin
    .from("reels")
    .update({ status: input.status })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/reels");
}

/**
 * Manual-assembly fallback: when the pipeline fails, an admin uploads a
 * hand-cut MP4 for the quest. Creates the pending reel and settles the job.
 */
export async function attachManualReel(formData: FormData) {
  await requireAdmin();

  const questId = z.string().uuid().parse(formData.get("quest_id"));
  const file = formData.get("video");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Attach an MP4 first.");
  }
  if (file.type !== "video/mp4") {
    throw new Error("MP4 only.");
  }
  if (file.size > 200 * 1024 * 1024) {
    throw new Error("200MB max.");
  }

  const admin = createAdminClient();
  const { data: quest } = await admin
    .from("quests")
    .select("id, user_id, city, title")
    .eq("id", questId)
    .maybeSingle();
  if (!quest) throw new Error("Quest not found.");

  const path = `r/${questId}/manual-${Date.now()}.mp4`;
  const { error: upErr } = await admin.storage
    .from("reel-media")
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: "video/mp4",
    });
  if (upErr) throw new Error(upErr.message);

  const { error: insertErr } = await admin.from("reels").insert({
    source: "user_quest",
    user_id: quest.user_id,
    quest_id: quest.id,
    city: quest.city,
    video_path: path,
    caption: quest.title,
    status: "pending",
  });
  if (insertErr) throw new Error(insertErr.message);

  await admin
    .from("reel_jobs")
    .update({ status: "done", error: "manual assembly" })
    .eq("quest_id", questId);
  revalidatePath("/admin/reels");
}

/** Re-queue a failed job for another pipeline attempt. */
export async function retryReelJob(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await admin
    .from("reel_jobs")
    .update({ status: "queued", attempts: 0, error: null })
    .eq("id", id);
  revalidatePath("/admin/reels");
}
