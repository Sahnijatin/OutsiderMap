"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createDiscoverBounty, resolveBounty } from "@/lib/scout/admin";

/**
 * Scout admin desk mutations (#114). These call is_admin()-guarded RPCs, so
 * they use the admin's *session* client (createClient) rather than the
 * service-role client — the RPC needs auth.uid() to be the admin both to pass
 * the guard and to stamp the audit row's admin_id.
 */

const ResolveSchema = z.object({
  bounty_id: z.string().uuid(),
  decision: z.enum(["publish", "reject"]),
  note: z.string().trim().max(500).optional(),
});

/** Admin-verification fallback: resolve a bounty a thin area can't. */
export async function resolveBountyAction(formData: FormData) {
  await requireAdmin();
  const input = ResolveSchema.parse({
    bounty_id: formData.get("bounty_id"),
    decision: formData.get("decision"),
    note: (formData.get("note") as string) || undefined,
  });

  const supabase = await createClient();
  await resolveBounty(supabase, {
    bountyId: input.bounty_id,
    decision: input.decision,
    note: input.note ?? null,
  });

  revalidatePath("/admin/scout");
}

const DiscoverSchema = z.object({
  city: z.string().trim().min(1),
  area: z.string().trim().optional(),
  bounty_points: z.coerce.number().int().min(0).max(1000),
});

/** Create a discover bounty from an admin tip / area gap. */
export async function createDiscoverBountyAction(formData: FormData) {
  await requireAdmin();
  const input = DiscoverSchema.parse({
    city: formData.get("city"),
    area: (formData.get("area") as string) || undefined,
    bounty_points: (formData.get("bounty_points") as string) || "0",
  });

  const supabase = await createClient();
  await createDiscoverBounty(supabase, {
    city: input.city,
    area: input.area ?? null,
    bountyPoints: input.bounty_points,
  });

  revalidatePath("/admin/scout");
}
