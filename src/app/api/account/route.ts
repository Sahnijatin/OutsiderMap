import { NextResponse, type NextRequest } from "next/server";
import { getApiContext } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEMBER_VETTING_BUCKET } from "@/lib/vetting/media";

/**
 * DPDP right-to-delete: purges all personal data for the authenticated user.
 *
 * Authenticates the caller (bearer or cookie) like every other /api route, then
 * uses the service role to erase everything keyed to them across the schema -
 * behavioural events, saved places, weekend plans, subscription, taste profile,
 * profile row, any waitlist application (and its private vetting media) - and
 * finally deletes the auth user so the account is gone, not just emptied.
 *
 * Best-effort but honest: every step runs even if an earlier one fails, and the
 * response reports any failures so the client never shows "deleted" on a
 * partial purge.
 */
export async function DELETE(request: NextRequest) {
  const ctx = await getApiContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Throttle this destructive, service-role, cascade-heavy purge. A legitimate
  // caller deletes their account at most a handful of times; anything above
  // that is abuse or a retry storm hammering the admin cascade.
  const allowed = await checkRateLimit(
    `account-delete:${ctx.user.id}`,
    3,
    3600,
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const admin = createAdminClient();
  const userId = ctx.user.id;
  const email = ctx.user.email ?? null;
  const errors: string[] = [];

  // Remove private vetting media first (the paths live on the waitlist row).
  if (email) {
    const { data: application } = await admin
      .from("waitlist")
      .select("selfie_path, photo_paths")
      .eq("email", email)
      .maybeSingle();
    const paths = [
      application?.selfie_path,
      ...(application?.photo_paths ?? []),
    ].filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const { error } = await admin.storage
        .from(MEMBER_VETTING_BUCKET)
        .remove(paths);
      if (error) errors.push(`vetting media: ${error.message}`);
    }
  }

  // Captured quest media + rendered reels: collect the storage paths BEFORE
  // the row cascade wipes the pointers, then remove the objects.
  const [{ data: questMedia }, { data: userReels }] = await Promise.all([
    admin.from("quest_stop_media").select("storage_path").eq("user_id", userId),
    admin
      .from("reels")
      .select("video_path, poster_path")
      .eq("user_id", userId),
  ]);
  const questPaths = (questMedia ?? []).map((m) => m.storage_path);
  if (questPaths.length > 0) {
    const { error } = await admin.storage.from("quest-media").remove(questPaths);
    if (error) errors.push(`quest media: ${error.message}`);
  }
  const reelPaths = (userReels ?? []).flatMap((r) =>
    [r.video_path, r.poster_path].filter((p): p is string => Boolean(p)),
  );
  if (reelPaths.length > 0) {
    const { error } = await admin.storage.from("reel-media").remove(reelPaths);
    if (error) errors.push(`reel media: ${error.message}`);
  }

  // Delete every row keyed to the user. chat threads/messages, quests/stops/
  // media, reel jobs and reels all cascade from the profiles delete; the
  // explicit deletes cover rows and collect per-table failures.
  const deletions: Array<PromiseLike<{ error: { message: string } | null }>> = [
    admin.from("interaction_events").delete().eq("user_id", userId),
    admin.from("saved_places").delete().eq("user_id", userId),
    admin.from("weekend_plans").delete().eq("user_id", userId),
    admin.from("chat_threads").delete().eq("user_id", userId),
    admin.from("quests").delete().eq("user_id", userId),
    admin.from("reel_jobs").delete().eq("user_id", userId),
    admin.from("reels").delete().eq("user_id", userId),
    admin.from("device_tokens").delete().eq("user_id", userId),
    admin.from("subscriptions").delete().eq("user_id", userId),
    admin.from("taste_profiles").delete().eq("user_id", userId),
    admin.from("profiles").delete().eq("id", userId),
  ];
  if (email) {
    deletions.push(admin.from("waitlist").delete().eq("email", email));
  }

  const results = await Promise.all(deletions);
  for (const { error } of results) {
    if (error) errors.push(error.message);
  }

  // Finally remove the auth user itself, so the account can't sign back in.
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) errors.push(`auth user: ${authError.message}`);

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "purge incomplete", details: errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
