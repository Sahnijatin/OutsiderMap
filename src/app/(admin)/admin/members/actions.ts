"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin role management. Two hard guards:
 *  - you cannot revoke YOURSELF (no locking the last key inside the house),
 *  - every change is logged loudly, because role changes are the kind of
 *    thing you want greppable when questions come later.
 */

export async function grantAdmin(formData: FormData) {
  const actor = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
  console.info(
    "[roles] admin granted",
    JSON.stringify({ by: actor.id, to: id }),
  );
  revalidatePath("/admin/members");
}

export async function revokeAdmin(formData: FormData) {
  const actor = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  if (id === actor.id) {
    throw new Error("You can't remove your own admin role - ask another admin.");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_admin: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  console.info(
    "[roles] admin revoked",
    JSON.stringify({ by: actor.id, from: id }),
  );
  revalidatePath("/admin/members");
}
