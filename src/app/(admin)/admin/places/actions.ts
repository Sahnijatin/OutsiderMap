"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { embedPlace } from "@/lib/places/embedding";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import type { Json, TablesInsert } from "@/types/database";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function parseJsonField(raw: string, field: string): Json | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as Json;
  } catch {
    throw new Error(`${field} is not valid JSON`);
  }
}

const FormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  area: z.string().trim().optional(),
  category: z.string().trim().optional(),
  price_level: z.coerce.number().int().min(1).max(4).optional(),
  vibe_tags: z.string().optional(),
  description: z.string().optional(),
  editor_note: z.string().optional(),
  hours: z.string().optional(),
  best_for: z.string().optional(),
  is_published: z.coerce.boolean(),
});

export async function upsertPlace(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();

  const input = FormSchema.parse({
    id: (formData.get("id") as string) || undefined,
    name: formData.get("name"),
    slug: (formData.get("slug") as string) || undefined,
    area: (formData.get("area") as string) || undefined,
    category: (formData.get("category") as string) || undefined,
    price_level: (formData.get("price_level") as string) || undefined,
    vibe_tags: (formData.get("vibe_tags") as string) ?? "",
    description: (formData.get("description") as string) ?? "",
    editor_note: (formData.get("editor_note") as string) ?? "",
    hours: (formData.get("hours") as string) ?? "",
    best_for: (formData.get("best_for") as string) ?? "",
    is_published: formData.get("is_published") === "on",
  });

  const slug = input.slug?.trim() || slugify(input.name);
  const vibeTags = (input.vibe_tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const row: TablesInsert<"places"> = {
    slug,
    name: input.name,
    area: input.area ?? null,
    category: input.category ?? null,
    price_level: input.price_level ?? null,
    vibe_tags: vibeTags,
    description: input.description?.trim() || null,
    editor_note: input.editor_note?.trim() || null,
    hours: parseJsonField(input.hours ?? "", "hours"),
    best_for: parseJsonField(input.best_for ?? "", "best_for"),
    is_published: input.is_published,
    updated_at: new Date().toISOString(),
  };

  // Image upload to the public bucket; the path is stored on the row.
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const ext = (image.name.split(".").pop() || "jpg").toLowerCase();
    const path = `places/${slug}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("place-images")
      .upload(path, image, { upsert: true, contentType: image.type });
    if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
    row.image_path = path;
  }

  // Regenerate the embedding whenever editorial content changes. Best
  // effort: a draft saved without an embeddings key just stays unmatched.
  try {
    if (serverEnv().OPENAI_API_KEY) {
      row.embedding = JSON.stringify(await embedPlace(row as Parameters<typeof embedPlace>[0]));
    }
  } catch (error) {
    console.error("Embedding regeneration failed:", error);
  }

  if (input.id) {
    const { error } = await admin
      .from("places")
      .update(row)
      .eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from("places")
      .insert({ ...row, source: "curated" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin/places");
  redirect("/admin/places");
}

export async function deletePlace(formData: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin.from("places").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/places");
  revalidatePath("/admin/submissions");
  redirect("/admin/places");
}
