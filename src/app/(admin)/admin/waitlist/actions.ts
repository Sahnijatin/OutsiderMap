"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Constrain to exactly the states the waitlist status check allows (0007).
const ReviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "accepted", "rejected", "waitlisted"]),
  reviewer_note: z.string().trim().max(500).optional(),
});

/**
 * Records an admin's vetting decision on a waitlist applicant: sets the new
 * status, stamps reviewed_at, and stores the reviewer note. The note field on
 * the form is prefilled with any existing note, so changing status without
 * editing it preserves the note; clearing the box clears it.
 */
export async function reviewApplicant(formData: FormData) {
  await requireAdmin();

  const input = ReviewSchema.parse({
    id: formData.get("id"),
    status: formData.get("status"),
    reviewer_note: (formData.get("reviewer_note") as string) || undefined,
  });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("waitlist")
    .update({
      status: input.status,
      reviewer_note: input.reviewer_note ?? null,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/waitlist");
}
