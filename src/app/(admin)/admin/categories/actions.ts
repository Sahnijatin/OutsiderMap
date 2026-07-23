"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/types/database";

/**
 * Map-category admin (#pins). Categories drive the pin color + legend, so a
 * save revalidates the map alongside the admin list. Deleting a category leaves
 * its places (FK on delete set null) — those pins fall back to the amber default.
 */

const FormSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{1,40}$/, "slug must be lowercase a–z, 0–9 or -"),
  label: z.string().trim().min(1),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb"),
  sort_order: z.coerce.number().int().min(0).max(999),
  is_active: z.coerce.boolean(),
});

export async function upsertCategory(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const input = FormSchema.parse({
    id: (formData.get("id") as string) || undefined,
    slug: formData.get("slug"),
    label: formData.get("label"),
    color: formData.get("color"),
    sort_order: (formData.get("sort_order") as string) || "0",
    is_active: formData.get("is_active") === "on",
  });

  const row: TablesInsert<"map_categories"> = {
    slug: input.slug,
    label: input.label,
    color: input.color.toLowerCase(),
    sort_order: input.sort_order,
    is_active: input.is_active,
  };

  const { error } = input.id
    ? await admin.from("map_categories").update(row).eq("id", input.id)
    : await admin.from("map_categories").insert(row);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/categories");
  revalidatePath("/map");
  redirect("/admin/categories");
}

export async function deleteCategory(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin.from("map_categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/categories");
  revalidatePath("/map");
  redirect("/admin/categories");
}
