"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// Unambiguous alphabet (no 0/O/1/I) so codes are easy to read aloud / type.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateReferralCode() {
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return `OUT-${code}`;
}

const ApplicationSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().min(6).max(24),
  gender: z
    .enum(["woman", "man", "non-binary", "prefer-not-to-say"])
    .optional(),
  city: z.string().trim().min(1).max(80),
  instagram: z.string().trim().max(60).optional(),
  referredBy: z.string().trim().max(24).optional(),
  spotArea: z.string().trim().max(120).optional(),
  spotDescription: z.string().trim().max(1000).optional(),
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ApplicationResult = { ok: true; referralCode: string };

/**
 * Persists a waitlist application. Runs with the service role (the visitor is
 * anonymous), so it is the trusted boundary: validate everything here. An
 * optional dropped spot is written to `places` as an unpublished submission,
 * landing in the same admin review queue as member suggestions.
 */
export async function submitApplication(
  formData: FormData,
): Promise<ApplicationResult> {
  const input = ApplicationSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    gender: (formData.get("gender") as string) || undefined,
    city: formData.get("city"),
    instagram: (formData.get("instagram") as string) || undefined,
    referredBy: (formData.get("referredBy") as string) || undefined,
    spotArea: (formData.get("spotArea") as string) || undefined,
    spotDescription: (formData.get("spotDescription") as string) || undefined,
  });

  const admin = createAdminClient();

  // Re-applying with the same email keeps the original shareable code, and we
  // track any spot they linked before so a new drop can replace it.
  const { data: existing } = await admin
    .from("waitlist")
    .select("id, referral_code, spot_place_id")
    .eq("email", input.email)
    .maybeSingle();

  const instagram = input.instagram
    ? input.instagram.replace(/^@+/, "").trim() || null
    : null;

  let referralCode = existing?.referral_code ?? generateReferralCode();
  // Don't let a returning applicant "refer" themselves with their own code.
  const referredBy =
    input.referredBy && input.referredBy.toUpperCase() !== referralCode
      ? input.referredBy.toUpperCase()
      : null;

  const baseRow = {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    gender: input.gender ?? null,
    city: input.city,
    instagram,
    referred_by: referredBy,
    updated_at: new Date().toISOString(),
  };

  // 1) Write the waitlist row first — being on the list is the primary goal,
  //    so it must succeed before we touch anything else. Spot link (if any)
  //    is preserved here and updated in step 2. On the (astronomically rare)
  //    chance a fresh referral_code collides, regenerate and retry.
  let saved = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error } = await admin
      .from("waitlist")
      .upsert(
        { ...baseRow, referral_code: referralCode },
        { onConflict: "email" },
      );
    if (!error) {
      saved = true;
      break;
    }
    if (error.code === "23505" && !existing) {
      referralCode = generateReferralCode();
      continue;
    }
    throw new Error(error.message);
  }
  if (!saved) {
    throw new Error("Couldn't reserve a referral code. Please try again.");
  }

  // 2) Optional spot drop -> submissions queue. Best-effort and only after the
  //    applicant is safely on the list: a spot failure must never block signup,
  //    and ordering this second means a places row is never orphaned by a
  //    failed waitlist write. Persist only when there's a real description.
  const description = input.spotDescription;
  if (description && description.length >= 10) {
    try {
      const spotPlaceId = await insertDroppedSpot(
        admin,
        input.spotArea ?? null,
        description,
        formData.get("spotPhoto"),
      );
      // Replace a spot from a previous application so re-applying doesn't
      // accumulate orphaned submissions (FK is on delete set null). Keep it if
      // an editor already published it (no longer an unreviewed submission).
      if (existing?.spot_place_id && existing.spot_place_id !== spotPlaceId) {
        await admin
          .from("places")
          .delete()
          .eq("id", existing.spot_place_id)
          .eq("source", "submitted")
          .eq("is_published", false);
      }
      await admin
        .from("waitlist")
        .update({
          spot_place_id: spotPlaceId,
          updated_at: new Date().toISOString(),
        })
        .eq("email", input.email);
    } catch (error) {
      // Don't fail the application over a spot the curators can live without.
      console.error("Dropped-spot submission failed:", error);
    }
  }

  return { ok: true, referralCode };
}

async function insertDroppedSpot(
  admin: AdminClient,
  area: string | null,
  description: string,
  photo: FormDataEntryValue | null,
): Promise<string> {
  const id = randomUUID();
  const slugBase =
    (area ?? "spot")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "spot";
  const slug = `${slugBase}-${id.slice(0, 6)}`;

  // Optional photo: validate type/size and upload via service role (the
  // place-images bucket is admin-write only). A bad/failed upload must not
  // block the submission, so we degrade to no image.
  let imagePath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const ext = IMAGE_EXT[photo.type];
    if (ext && photo.size <= MAX_IMAGE_BYTES) {
      const path = `submitted/${id}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("place-images")
        .upload(path, photo, { contentType: photo.type, upsert: true });
      if (!uploadError) imagePath = path;
    }
  }

  const { data, error } = await admin
    .from("places")
    .insert({
      id,
      slug,
      name: area ? `Spot in ${area}`.slice(0, 120) : "Untitled spot",
      area,
      description,
      image_path: imagePath,
      source: "submitted",
      is_published: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
