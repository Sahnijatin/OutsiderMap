"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Enable/disable an experiment from the metrics page (#120 part 2b). Admin-only
 * (RLS on `experiments` is is_admin(); requireAdmin() gates the action too).
 * Turning it off makes the serve path fall back to default behavior at once.
 */
export async function toggleExperiment(formData: FormData) {
  await requireAdmin();
  const key = String(formData.get("key") ?? "");
  const enabled = formData.get("enabled") === "true";
  if (!key) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("experiments")
    .update({ enabled })
    .eq("key", key);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/metrics");
}
