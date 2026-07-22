"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Grievance Officer actions. Acknowledge stamps the 24h SLA clock; resolve /
 * reject close it. The officer is recorded on the grievance for compliance.
 */
const Schema = z.object({
  id: z.string().uuid(),
  action: z.enum(["acknowledge", "resolve", "reject"]),
});

export async function actOnGrievance(formData: FormData) {
  const me = await requireAdmin();
  const input = Schema.parse({
    id: formData.get("id"),
    action: formData.get("action"),
  });

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const patch =
    input.action === "acknowledge"
      ? { status: "acknowledged" as const, acknowledged_at: now, officer_id: me.id }
      : input.action === "resolve"
        ? { status: "resolved" as const, resolved_at: now, officer_id: me.id }
        : { status: "rejected" as const, resolved_at: now, officer_id: me.id };

  const { error } = await admin.from("grievances").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/grievances");
}
