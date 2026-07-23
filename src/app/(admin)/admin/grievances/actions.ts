"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type GrievanceUpdate = Database["public"]["Tables"]["grievances"]["Update"];

/**
 * Grievance Officer actions. Acknowledge stamps the 24h SLA clock; resolve /
 * reject close it. Once a reporter appeals (status 'appealed'), the Grievance
 * Appellate Committee (GAC) either overturns (resolves in the reporter's
 * favour) or upholds (the original rejection stands) — the decision is recorded
 * on the grievance. The officer is recorded for compliance throughout.
 */
const Schema = z.object({
  id: z.string().uuid(),
  action: z.enum(["acknowledge", "resolve", "reject", "overturn", "uphold"]),
});

export async function actOnGrievance(formData: FormData) {
  const me = await requireAdmin();
  const input = Schema.parse({
    id: formData.get("id"),
    action: formData.get("action"),
  });

  const admin = createAdminClient();
  const now = new Date().toISOString();

  let patch: GrievanceUpdate;
  switch (input.action) {
    case "acknowledge":
      patch = { status: "acknowledged", acknowledged_at: now, officer_id: me.id };
      break;
    case "resolve":
      patch = { status: "resolved", resolved_at: now, officer_id: me.id };
      break;
    case "reject":
      patch = { status: "rejected", resolved_at: now, officer_id: me.id };
      break;
    case "overturn":
      // GAC grants the appeal — the grievance is actioned in the reporter's favour.
      patch = {
        status: "resolved",
        appeal_decision: "overturned",
        appeal_decided_at: now,
        resolved_at: now,
        officer_id: me.id,
      };
      break;
    case "uphold":
      // GAC denies the appeal — the original decision stands.
      patch = {
        status: "rejected",
        appeal_decision: "upheld",
        appeal_decided_at: now,
        resolved_at: now,
        officer_id: me.id,
      };
      break;
  }

  const { error } = await admin.from("grievances").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/grievances");
}
