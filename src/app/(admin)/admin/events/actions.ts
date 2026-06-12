"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/types/database";

const FormSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1),
  venue_name: z.string().trim().optional(),
  area: z.string().trim().optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().optional(),
  vibe_tags: z.string().optional(),
  description: z.string().optional(),
  ticket_url: z.string().url().optional().or(z.literal("")),
  is_underground: z.coerce.boolean(),
  required_tier: z.enum(["free", "premium"]),
  is_published: z.coerce.boolean(),
});

/** datetime-local arrives without a zone; events are IST by definition. */
function istToIso(local: string) {
  return new Date(`${local}:00+05:30`).toISOString();
}

export async function upsertEvent(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const input = FormSchema.parse({
    id: (formData.get("id") as string) || undefined,
    title: formData.get("title"),
    venue_name: (formData.get("venue_name") as string) || undefined,
    area: (formData.get("area") as string) || undefined,
    starts_at: formData.get("starts_at"),
    ends_at: (formData.get("ends_at") as string) || undefined,
    vibe_tags: (formData.get("vibe_tags") as string) ?? "",
    description: (formData.get("description") as string) ?? "",
    ticket_url: (formData.get("ticket_url") as string) ?? "",
    is_underground: formData.get("is_underground") === "on",
    required_tier: formData.get("required_tier"),
    is_published: formData.get("is_published") === "on",
  });

  const row: TablesInsert<"events"> = {
    title: input.title,
    venue_name: input.venue_name ?? null,
    area: input.area ?? null,
    starts_at: istToIso(input.starts_at),
    ends_at: input.ends_at ? istToIso(input.ends_at) : null,
    vibe_tags: (input.vibe_tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    description: input.description?.trim() || null,
    ticket_url: input.ticket_url || null,
    is_underground: input.is_underground,
    required_tier: input.required_tier,
    is_published: input.is_published,
    updated_at: new Date().toISOString(),
  };

  const { error } = input.id
    ? await admin.from("events").update(row).eq("id", input.id)
    : await admin.from("events").insert(row);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/events");
  redirect("/admin/events");
}

export async function deleteEvent(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/events");
  redirect("/admin/events");
}
