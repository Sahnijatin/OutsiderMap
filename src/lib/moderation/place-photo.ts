import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createCsamScanner, quarantineAndReport } from "./csam";
import { createImageModerator } from "./image";
import { screeningPosture } from "./trust";
import { resolvePublishStatus } from "./publish";
import { deriveTier } from "./trust";
import type { TrustTier } from "./model";

/**
 * Pre-publish screening for a member's place photo.
 *
 * Same invariant as the post gate: no unscreened media reaches the public
 * gallery. CSAM first and unconditionally, then the image moderator, then the
 * contributor's posture decides whether an uncertain result publishes or
 * waits. All media is `pre_screen`, so in practice a photo publishes only on
 * a clean auto-approve.
 *
 * Note on today's behaviour: `createImageModerator()` is still the hold-
 * everything default until a vision vendor is onboarded (#91), so every photo
 * lands `pending` and a human clears it in /admin/places/photos. That is the
 * safe direction to be wrong in, but it does mean the review queue is load-
 * bearing - a photo nobody looks at never reaches the person who took it.
 *
 * Unlike `moderatePost` this does not open a moderation_case: that table is
 * shaped around posts. Rejections here are terminal and recorded on the media
 * row itself; wiring place photos into the case queue is a follow-up.
 */

type Admin = SupabaseClient<Database>;

async function trustTierFor(admin: Admin, userId: string): Promise<TrustTier> {
  const { data: trust } = await admin
    .from("user_trust")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  if (trust) return trust.tier;

  const { data: profile } = await admin
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle();
  const ageDays = profile
    ? (Date.now() - new Date(profile.created_at).getTime()) / 86_400_000
    : 0;
  return deriveTier({ accountAgeDays: ageDays, strikeCount: 0 });
}

export type PlacePhotoScreening = {
  status: "published" | "pending" | "removed";
  reason: string | null;
};

export async function screenPlacePhoto(
  admin: Admin,
  opts: { bucket: string; path: string; contributorId: string },
): Promise<PlacePhotoScreening> {
  const ref = { bucket: opts.bucket, path: opts.path, kind: "image" as const };

  const match = await createCsamScanner().scan(ref);
  if (match.hit) {
    await quarantineAndReport(admin, ref, match.source ?? "csam");
    return { status: "removed", reason: "csam" };
  }

  const decision = await createImageModerator().moderateImage(ref);
  const tier = await trustTierFor(admin, opts.contributorId);
  const { status } = resolvePublishStatus(
    decision.action,
    screeningPosture(tier, true),
  );

  if (status === "rejected") {
    // Nothing rejected stays in a public bucket.
    await admin.storage.from(opts.bucket).remove([opts.path]);
    return { status: "removed", reason: decision.reason ?? "rejected" };
  }
  return {
    status: status === "approved" ? "published" : "pending",
    reason: status === "approved" ? null : (decision.reason ?? null),
  };
}
