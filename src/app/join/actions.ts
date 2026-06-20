"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  adminApplicationEmail,
  applicantWelcomeEmail,
} from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/resend";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";
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
  spotLandmark: z.string().trim().max(300).optional(),
  spotLabel: z.string().trim().max(200).optional(),
  spotLat: z.coerce.number().min(-90).max(90).optional(),
  spotLng: z.coerce.number().min(-180).max(180).optional(),
  spotDescription: z.string().trim().max(1000).optional(),
  utmSource: z.string().trim().max(200).optional(),
  utmMedium: z.string().trim().max(200).optional(),
  utmCampaign: z.string().trim().max(200).optional(),
  utmTerm: z.string().trim().max(200).optional(),
  utmContent: z.string().trim().max(200).optional(),
  referrer: z.string().trim().max(500).optional(),
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const EXT_MIME: Record<"jpg" | "png" | "webp", string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Identifies an image by its magic bytes, not the client-supplied MIME type -
 * the bucket is public-read, so we must not trust the caller's Content-Type.
 * Returns the canonical extension, or null if the bytes aren't an allowed image.
 */
async function sniffImageExt(
  file: File,
): Promise<"jpg" | "png" | "webp" | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "png";
  // RIFF....WEBP
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "webp";
  return null;
}

export type ApplicationResult = {
  ok: true;
  referralCode: string;
  /** True when this email was already on the list (no new write/email). */
  alreadyJoined?: boolean;
};

/**
 * Persists a waitlist application. Runs with the service role (the visitor is
 * anonymous), so it is the trusted boundary: validate everything here. An
 * optional dropped spot is written to `places` as an unpublished submission,
 * landing in the same admin review queue as member suggestions.
 */
export async function submitApplication(
  formData: FormData,
): Promise<ApplicationResult> {
  // Identify the caller for rate limiting / Turnstile (anonymous endpoint).
  const hdrs = await headers();
  const ip =
    (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;

  // Shed abuse before doing any work: cap submissions per IP, then verify the
  // bot-check token. Both no-op when their env isn't configured.
  const allowed = await checkRateLimit(`waitlist:${ip ?? "unknown"}`, 5, 600);
  if (!allowed) {
    throw new Error(
      "Too many attempts from here. Wait a few minutes and try again.",
    );
  }
  const humanOk = await verifyTurnstile(
    (formData.get("turnstileToken") as string) || null,
    ip,
  );
  if (!humanOk) {
    throw new Error("Verification failed. Refresh the page and try again.");
  }

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
    spotLandmark: (formData.get("spotLandmark") as string) || undefined,
    spotLabel: (formData.get("spotLabel") as string) || undefined,
    // Empty -> undefined so z.coerce.number doesn't turn "" into 0,0.
    spotLat: (formData.get("spotLat") as string) || undefined,
    spotLng: (formData.get("spotLng") as string) || undefined,
    spotDescription: (formData.get("spotDescription") as string) || undefined,
    utmSource: (formData.get("utmSource") as string) || undefined,
    utmMedium: (formData.get("utmMedium") as string) || undefined,
    utmCampaign: (formData.get("utmCampaign") as string) || undefined,
    utmTerm: (formData.get("utmTerm") as string) || undefined,
    utmContent: (formData.get("utmContent") as string) || undefined,
    referrer: (formData.get("referrer") as string) || undefined,
  });

  const admin = createAdminClient();

  // Re-applying with the same email keeps the original shareable code, and we
  // track any spot they linked before so a new drop can replace it.
  const { data: existing } = await admin
    .from("waitlist")
    .select("id, referral_code, spot_place_id")
    .eq("email", input.email)
    .maybeSingle();

  // One signup per email. Whitelisted test addresses may re-submit freely
  // (re-writes + re-sends emails); everyone else is bounced to their existing
  // code with no duplicate row or email.
  const testEmails = (serverEnv().WAITLIST_TEST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isTestEmail = testEmails.includes(input.email);
  if (existing && !isTestEmail) {
    return {
      ok: true,
      referralCode: existing.referral_code,
      alreadyJoined: true,
    };
  }

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

  // 1) Write the waitlist row first - being on the list is the primary goal,
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

  // 1b) First-touch attribution. Deliberately a separate, best-effort write so
  //     the core signup can never be blocked by it - e.g. if the utm_* columns
  //     (migration 0005) haven't been applied yet, the update just no-ops.
  //     Only stamped on the initial signup so a re-apply can't overwrite it.
  const hasAttribution =
    input.utmSource ||
    input.utmMedium ||
    input.utmCampaign ||
    input.utmTerm ||
    input.utmContent ||
    input.referrer;
  if (!existing && hasAttribution) {
    const { error: attrError } = await admin
      .from("waitlist")
      .update({
        utm_source: input.utmSource ?? null,
        utm_medium: input.utmMedium ?? null,
        utm_campaign: input.utmCampaign ?? null,
        utm_term: input.utmTerm ?? null,
        utm_content: input.utmContent ?? null,
        referrer: input.referrer ?? null,
      })
      .eq("email", input.email);
    if (attrError) {
      console.error("UTM attribution skipped:", attrError.message);
    }
  }

  // 2) Optional spot drop -> submissions queue. Best-effort and only after the
  //    applicant is safely on the list: a spot failure must never block signup,
  //    and ordering this second means a places row is never orphaned by a
  //    failed waitlist write. Persist only when there's a real description.
  let droppedSpotId: string | null = null;
  const description = input.spotDescription;
  if (description && description.length >= 10) {
    try {
      const spotPlaceId = await insertDroppedSpot(admin, {
        area: input.spotArea ?? null,
        description,
        landmark: input.spotLandmark ?? null,
        label: input.spotLabel ?? null,
        lat: input.spotLat ?? null,
        lng: input.spotLng ?? null,
        photo: formData.get("spotPhoto"),
      });
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
      droppedSpotId = spotPlaceId;
    } catch (error) {
      // Don't fail the application over a spot the curators can live without.
      console.error("Dropped-spot submission failed:", error);
    }
  }

  // 3) Notifications - applicant confirmation + admin alert. Best-effort and
  //    deferred via after() so email latency never delays the success screen.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const spotId = droppedSpotId;
  after(async () => {
    try {
      const welcome = applicantWelcomeEmail({
        firstName: input.firstName,
        referralCode,
        shareUrl: `${appUrl}/join?ref=${referralCode}`,
      });
      await sendEmail({
        to: input.email,
        subject: welcome.subject,
        html: welcome.html,
      });
    } catch (error) {
      console.error("Waitlist welcome email failed:", error);
    }

    const adminEmail = serverEnv().RESEND_ADMIN_EMAIL;
    if (adminEmail) {
      try {
        const alert = adminApplicationEmail({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          city: input.city,
          instagram,
          referredBy,
          spotUrl: spotId ? `${appUrl}/admin/places/${spotId}` : null,
          waitlistUrl: `${appUrl}/admin/waitlist`,
        });
        await sendEmail({
          to: adminEmail,
          subject: alert.subject,
          html: alert.html,
          replyTo: input.email,
        });
      } catch (error) {
        console.error("Waitlist admin email failed:", error);
      }
    }
  });

  return { ok: true, referralCode };
}

type DroppedSpot = {
  area: string | null;
  description: string;
  landmark: string | null;
  label: string | null;
  lat: number | null;
  lng: number | null;
  photo: FormDataEntryValue | null;
};

async function insertDroppedSpot(
  admin: AdminClient,
  spot: DroppedSpot,
): Promise<string> {
  const id = randomUUID();
  const slugBase =
    (spot.label ?? spot.area ?? "spot")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "spot";
  const slug = `${slugBase}-${id.slice(0, 6)}`;

  // Optional photo: enforce size, then verify the actual bytes are a real
  // image (magic-byte sniff, not the client-supplied MIME) before uploading
  // via service role. A bad/failed upload must not block the submission, so we
  // degrade to no image.
  let imagePath: string | null = null;
  const photo = spot.photo;
  if (photo instanceof File && photo.size > 0 && photo.size <= MAX_IMAGE_BYTES) {
    const ext = await sniffImageExt(photo);
    if (ext) {
      const path = `submitted/${id}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("place-images")
        .upload(path, photo, { contentType: EXT_MIME[ext], upsert: true });
      if (!uploadError) imagePath = path;
    }
  }

  // Coordinates only when both are present (the map gives them as a pair).
  const hasCoords = spot.lat !== null && spot.lng !== null;
  const name =
    spot.label?.slice(0, 120) ||
    (spot.area ? `Spot in ${spot.area}`.slice(0, 120) : "Untitled spot");

  const { data, error } = await admin
    .from("places")
    .insert({
      id,
      slug,
      name,
      area: spot.area,
      lat: hasCoords ? spot.lat : null,
      lng: hasCoords ? spot.lng : null,
      // "How to find it" goes in editor_note for the reviewing admin.
      editor_note: spot.landmark,
      description: spot.description,
      image_path: imagePath,
      source: "submitted",
      is_published: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}
