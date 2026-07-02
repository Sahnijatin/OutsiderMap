import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Frequency-cap substrate for push notifications.
 *
 * The sender itself is deferred (needs APNs/FCM credentials), but the rule for
 * *whether* a user may be notified lives here so it's testable and ready: read
 * the user's recent sends from notification_sends and apply a per-day cap plus a
 * minimum gap between notifications.
 */

type Client = SupabaseClient<Database>;

export type FrequencyCap = {
  /** Max notifications in a rolling 24h window. */
  perDay: number;
  /** Minimum minutes between any two notifications. */
  minGapMinutes: number;
};

export const DEFAULT_CAP: FrequencyCap = { perDay: 2, minGapMinutes: 180 };

/**
 * Returns whether a notification may be sent to `userId` right now under `cap`.
 * Uses a service-role client (the sender context); reads only the recent log.
 */
export async function canSendNotification(
  admin: Client,
  userId: string,
  cap: FrequencyCap = DEFAULT_CAP,
  now: Date = new Date(),
): Promise<boolean> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("notification_sends")
    .select("sent_at")
    .eq("user_id", userId)
    .gte("sent_at", dayAgo)
    .order("sent_at", { ascending: false });

  // Fail closed: if we can't read the log, don't risk over-notifying.
  if (error) return false;

  const sends = data ?? [];
  if (sends.length >= cap.perDay) return false;

  if (sends.length > 0) {
    const last = new Date(sends[0].sent_at).getTime();
    const gapMs = cap.minGapMinutes * 60 * 1000;
    if (now.getTime() - last < gapMs) return false;
  }

  return true;
}

/** Records that a notification was sent, so future caps account for it. */
export async function recordNotificationSend(
  admin: Client,
  userId: string,
  kind: string,
): Promise<void> {
  await admin.from("notification_sends").insert({ user_id: userId, kind });
}
