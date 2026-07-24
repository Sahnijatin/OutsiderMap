"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveTier, resolveEnforcement } from "@/lib/moderation/trust";

/**
 * Human review actions on a moderation case. Each writes to the immutable
 * moderation_actions audit log. Content status + user enforcement go through
 * the service role (RLS/triggers keep them off the client).
 */
const ActionSchema = z.object({
  case_id: z.string().uuid(),
  action: z.enum(["approve", "remove", "escalate", "warn", "mute", "ban"]),
});

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
  let applied: { action: string; muteHours: number; strikeCount: number } | null =
    null;

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
    // warn / mute / ban - enforcement on the author (a strike either way).
    // The escalating ladder (trust.ts) drives duration by strike count; the
    // reviewer's pick can only escalate past it, never soften it.
    const [{ data: trust }, { data: profile }] = await Promise.all([
      admin
        .from("user_trust")
        .select("strike_count")
        .eq("user_id", c.author_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("created_at")
        .eq("id", c.author_id)
        .maybeSingle(),
    ]);

    const enforcement = resolveEnforcement(
      trust?.strike_count ?? 0,
      input.action as "warn" | "mute" | "ban",
    );
    const accountAgeDays = profile?.created_at
      ? Math.floor((Date.now() - Date.parse(profile.created_at)) / DAY_MS)
      : 0;
    const tier = deriveTier({
      accountAgeDays,
      strikeCount: enforcement.strikeCount,
    });
    applied = enforcement;

    await admin.from("user_trust").upsert(
      {
        user_id: c.author_id,
        strike_count: enforcement.strikeCount,
        tier,
        updated_at: now,
        ...(enforcement.action === "mute"
          ? {
              muted_until: new Date(
                Date.now() + enforcement.muteHours * HOUR_MS,
              ).toISOString(),
            }
          : {}),
        ...(enforcement.action === "ban" ? { banned_at: now } : {}),
      },
      { onConflict: "user_id" },
    );
  }

  await admin.from("moderation_actions").insert({
    case_id: c.id,
    actor: me.id,
    action: input.action,
    detail: {
      target_type: c.target_type,
      target_id: c.target_id,
      // the effective enforcement, which the ladder may escalate past the pick
      ...(applied ? { applied } : {}),
    },
  });
  revalidatePath("/admin/moderation");
}
