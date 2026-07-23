"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { embedPlace } from "@/lib/places/embedding";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadExperienceMedia } from "@/lib/media/experience";
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

/**
 * Builds the `story` jsonb from the editor's indexed form fields. Each card has
 * a caption, a media type, an optional existing media_path (edits that keep the
 * same media), and an optional newly-picked file (uploaded to experience-media).
 * Cards in, story order out - the editor renders fields in display order.
 * Cards that end up with no media are dropped.
 */
async function buildStoryCards(
  admin: ReturnType<typeof createAdminClient>,
  formData: FormData,
  slug: string,
): Promise<Json> {
  const count = Number(formData.get("story_count") ?? 0);
  if (!Number.isFinite(count) || count <= 0) return [];

  const cards: Json[] = [];
  for (let i = 0; i < count; i += 1) {
    const caption = ((formData.get(`story_${i}_caption`) as string) ?? "").trim();
    let mediaPath = (formData.get(`story_${i}_media_path`) as string) || null;
    let mediaType =
      (formData.get(`story_${i}_media_type`) as string) === "video"
        ? "video"
        : "image";

    const file = formData.get(`story_${i}_file`);
    if (file instanceof File && file.size > 0) {
      const uploaded = await uploadExperienceMedia(
        admin,
        `experiences/${slug}/card-${i}`,
        file,
      );
      mediaPath = uploaded.mediaPath;
      mediaType = uploaded.mediaType;
    }

    // Keep a card with media OR a caption - caption-only cards render over the
    // hero image in the app (see the mobile experience reader). Drop only cards
    // that are entirely empty.
    if (!mediaPath && !caption) continue;
    cards.push({ media_path: mediaPath, media_type: mediaType, caption });
  }
  return cards;
}

const FormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  area: z.string().trim().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  category_id: z.string().uuid().optional(),
  kind: z
    .enum([
      "spot",
      "cafe",
      "nightlife",
      "workshop",
      "historical",
      "cultural",
      "event",
    ])
    .default("spot"),
  is_chain: z.coerce.boolean(),
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
    lat: (formData.get("lat") as string) || undefined,
    lng: (formData.get("lng") as string) || undefined,
    category_id: (formData.get("category_id") as string) || undefined,
    kind: (formData.get("kind") as string) || undefined,
    is_chain: formData.get("is_chain") === "on",
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
  const story = await buildStoryCards(admin, formData, slug);

  const row: TablesInsert<"places"> = {
    slug,
    name: input.name,
    area: input.area ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    category_id: input.category_id ?? null,
    kind: input.kind,
    is_chain: input.is_chain,
    price_level: input.price_level ?? null,
    vibe_tags: vibeTags,
    description: input.description?.trim() || null,
    editor_note: input.editor_note?.trim() || null,
    hours: parseJsonField(input.hours ?? "", "hours"),
    best_for: parseJsonField(input.best_for ?? "", "best_for"),
    story,
    is_published: input.is_published,
    updated_at: new Date().toISOString(),
  };

  // Keep the legacy free-text `category` in sync with the chosen managed
  // category's slug (some readers still use it); leave it untouched when none
  // is selected so an edit never silently wipes it.
  if (input.category_id) {
    const { data: cat } = await admin
      .from("map_categories")
      .select("slug")
      .eq("id", input.category_id)
      .maybeSingle();
    row.category = cat?.slug ?? null;
  }

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
