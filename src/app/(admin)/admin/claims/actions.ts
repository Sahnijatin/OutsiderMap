"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Approve: the claim is verified, the place carries the owner's mark. */
export async function approveClaim(formData: FormData) {
  const profile = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();

  const { data: claim } = await admin
    .from("place_claims")
    .select("id, place_id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!claim || claim.status !== "pending") throw new Error("Not reviewable.");

  const { error } = await admin
    .from("place_claims")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await admin
    .from("places")
    .update({ claimed_by: claim.user_id })
    .eq("id", claim.place_id);

  console.info(
    "[claims] approved",
    JSON.stringify({ by: profile.id, claim: id, place: claim.place_id, owner: claim.user_id }),
  );
  revalidatePath("/admin/claims");
  revalidatePath("/business");
}

export async function rejectClaim(formData: FormData) {
  const profile = await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  await admin
    .from("place_claims")
    .update({
      status: "rejected",
      reviewed_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/claims");
  revalidatePath("/business");
}
