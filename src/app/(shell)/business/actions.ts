"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** File a claim on a place. RLS enforces user_id = self; the desk decides. */
export async function submitClaim(formData: FormData) {
  const profile = await requireOnboarded();
  const placeId = z.string().uuid().parse(formData.get("placeId"));
  const note = z.string().trim().min(3).max(400).parse(formData.get("note"));
  const contact = z
    .string()
    .trim()
    .max(120)
    .optional()
    .parse(formData.get("contact") ?? undefined);

  const supabase = await createClient();
  const { error } = await supabase.from("place_claims").insert({
    place_id: placeId,
    user_id: profile.id,
    note,
    contact: contact || null,
  });
  // A repeat claim on the same place hits the unique constraint - that's
  // fine, their original claim stands.
  if (error && !error.message.includes("duplicate")) {
    throw new Error(error.message);
  }
  revalidatePath("/business");
}
