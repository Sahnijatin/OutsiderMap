import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { mergeDecisions } from "./decision";
import { createTextModerator } from "./text";
import { createImageModerator } from "./image";
import { createCsamScanner, quarantineAndReport } from "./csam";
import { deriveTier, screeningPosture } from "./trust";
import { resolvePublishStatus } from "./publish";
import type { ModerationDecision } from "./types";
import type { TrustTier } from "./model";

/**
 * The pre-publish gate. Screens a pending post (CSAM → text → image), decides
 * the publish status by the author's trust posture, flips posts.status via the
 * service role, opens/updates a moderation_case, and writes the audit row.
 * Nothing reaches public visibility without passing through here.
 */

type Admin = SupabaseClient<Database>;

async function trustTierFor(admin: Admin, userId: string): Promise<TrustTier> {
  const { data: trust } = await admin
    .from("user_trust")
    .select("tier, strike_count")
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
  const tier = deriveTier({ accountAgeDays: ageDays, strikeCount: 0 });
  await admin
    .from("user_trust")
    .upsert({ user_id: userId, tier }, { onConflict: "user_id" });
  return tier;
}

async function finalize(
  admin: Admin,
  post: { id: string; author_id: string },
  status: "approved" | "rejected" | "pending",
  caseDecision: "auto_approved" | "auto_rejected" | "needs_review",
  decision: ModerationDecision,
  actor: string,
): Promise<void> {
  await admin.from("posts").update({ status }).eq("id", post.id);

  const assessment = {
    action: decision.action,
    categories: decision.categories,
    confidence: decision.confidence,
    reason: decision.reason ?? null,
  };
  const resolvedAt =
    caseDecision === "needs_review" ? null : new Date().toISOString();

  const { data: existing } = await admin
    .from("moderation_cases")
    .select("id")
    .eq("target_type", "post")
    .eq("target_id", post.id)
    .maybeSingle();

  let caseId = existing?.id ?? null;
  if (caseId) {
    await admin
      .from("moderation_cases")
      .update({
        decision: caseDecision,
        severity: decision.severity,
        assessment,
        resolved_at: resolvedAt,
      })
      .eq("id", caseId);
  } else {
    const { data: created } = await admin
      .from("moderation_cases")
      .insert({
        target_type: "post",
        target_id: post.id,
        author_id: post.author_id,
        source: "pre_publish",
        decision: caseDecision,
        severity: decision.severity,
        assessment,
        resolved_at: resolvedAt,
      })
      .select("id")
      .single();
    caseId = created?.id ?? null;
  }

  const action =
    status === "approved" ? "approved" : status === "rejected" ? "removed" : "held";
  await admin.from("moderation_actions").insert({
    case_id: caseId,
    actor,
    action,
    detail: assessment,
  });
}

/**
 * Screen a pending post and set its final status. Idempotent-ish: only acts
 * while status is 'pending'. Safe to call after create (text) and after each
 * media confirm (re-screens with media).
 */
export async function moderatePost(admin: Admin, postId: string): Promise<void> {
  const { data: post } = await admin
    .from("posts")
    .select("id, author_id, action, body, status")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.status !== "pending") return;

  const { data: media } = await admin
    .from("post_media")
    .select("kind, path, bucket")
    .eq("post_id", postId);
  const mediaList = media ?? [];

  // CSAM first, on every media item, before anything else can happen.
  const scanner = createCsamScanner();
  for (const m of mediaList) {
    const match = await scanner.scan({ bucket: m.bucket, path: m.path, kind: m.kind });
    if (match.hit) {
      await quarantineAndReport(
        admin,
        { bucket: m.bucket, path: m.path, kind: m.kind },
        match.source ?? scanner.name,
      );
      await finalize(
        admin,
        post,
        "rejected",
        "auto_rejected",
        { action: "auto_reject", categories: ["csam"], confidence: 1, severity: 100, reason: "csam" },
        "system:csam",
      );
      return;
    }
  }

  const decisions: ModerationDecision[] = [];
  const text = [post.action, post.body].filter(Boolean).join("\n").trim();
  if (text) decisions.push(await createTextModerator().moderateText(text));
  if (mediaList.length > 0) {
    const im = createImageModerator();
    for (const m of mediaList) {
      decisions.push(await im.moderateImage({ bucket: m.bucket, path: m.path, kind: m.kind }));
    }
  }
  const decision = mergeDecisions(decisions);

  const tier = await trustTierFor(admin, post.author_id);
  const posture = screeningPosture(tier, mediaList.length > 0);
  const { status, caseDecision } = resolvePublishStatus(decision.action, posture);

  await finalize(admin, post, status, caseDecision, decision, "system:auto");
}
