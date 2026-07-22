"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Human review actions on a moderation case. Each writes to the immutable
 * moderation_actions audit log. Content status + user enforcement go through
 * the service role (RLS/triggers keep them off the client).
 */
const ActionSchema = z.object({
  case_id: z.string().uuid(),
  action: z.enum(["approve", "remove", "escalate", "warn", "mute", "ban"]),
});

const DAY_MS = 24 * 60 * 60 * 1000;

export async function actOnCase(formData: FormData) {
  const me = await requireAdmin();
  const input = ActionSchema.parse({
    case_id: formData.get("case_id"),
    action: formData.get("action"),
  });

  const admin = createAdminClient();
  const { data: c } = await admin
    .from("moderation_cases")
    .select("id, target_type, target_id, author_id")
    .eq("id", input.case_id)
    .maybeSingle();
  if (!c) throw new Error("Case not found.");

  const now = new Date().toISOString();

  if (input.action === "approve" || input.action === "remove") {
    const status = input.action === "approve" ? "approved" : "removed";
    if (c.target_type === "post") {
      await admin.from("posts").update({ status }).eq("id", c.target_id);
    } else if (c.target_type === "comment") {
      await admin
        .from("post_comments")
        .update({ status: input.action === "approve" ? "approved" : "removed" })
        .eq("id", c.target_id);
    }
    await admin
      .from("moderation_cases")
      .update({
        decision: input.action === "approve" ? "approved" : "removed",
        reviewer_id: me.id,
        resolved_at: now,
      })
      .eq("id", c.id);
  } else if (input.action === "escalate") {
    await admin
      .from("moderation_cases")
      .update({ decision: "escalated", reviewer_id: me.id })
      .eq("id", c.id);
  } else if (c.author_id) {
    // warn / mute / ban — enforcement on the author (a strike either way).
    const { data: trust } = await admin
      .from("user_trust")
      .select("strike_count")
      .eq("user_id", c.author_id)
      .maybeSingle();
    const strikes = (trust?.strike_count ?? 0) + 1;
    await admin.from("user_trust").upsert(
      {
        user_id: c.author_id,
        strike_count: strikes,
        updated_at: now,
        ...(input.action === "mute"
          ? { muted_until: new Date(Date.now() + DAY_MS).toISOString() }
          : {}),
        ...(input.action === "ban" ? { banned_at: now } : {}),
      },
      { onConflict: "user_id" },
    );
  }

  await admin.from("moderation_actions").insert({
    case_id: c.id,
    actor: me.id,
    action: input.action,
    detail: { target_type: c.target_type, target_id: c.target_id },
  });
  revalidatePath("/admin/moderation");
}
