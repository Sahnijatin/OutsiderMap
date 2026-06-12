import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyWebhookSignature } from "@/lib/razorpay/client";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Razorpay subscription lifecycle webhook. The single source of truth for
 * the subscriptions table — written with the service role; users never
 * write their own tier.
 *
 * Subscribe to: subscription.activated, subscription.charged,
 * subscription.halted, subscription.cancelled, subscription.completed,
 * subscription.expired.
 */

const EventSchema = z.object({
  event: z.string(),
  payload: z.object({
    subscription: z.object({
      entity: z.object({
        id: z.string(),
        status: z.string(),
        current_end: z.number().nullable(),
        notes: z
          .union([
            z.record(z.string(), z.string()),
            z.array(z.unknown()),
          ])
          .optional(),
      }),
    }),
  }),
});

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const parsed = EventSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    // Not a subscription event — acknowledge and ignore.
    return NextResponse.json({ ignored: true });
  }

  const { event } = parsed.data;
  const subscription = parsed.data.payload.subscription.entity;
  const notes = subscription.notes;
  const userId =
    notes && !Array.isArray(notes) ? notes["user_id"] : undefined;
  if (!userId) {
    return NextResponse.json({ ignored: true, reason: "no user_id note" });
  }

  let tier: "free" | "premium" = "premium";
  let status: "active" | "past_due" | "canceled" = "active";
  switch (event) {
    case "subscription.activated":
    case "subscription.charged":
    case "subscription.resumed":
      tier = "premium";
      status = "active";
      break;
    case "subscription.halted":
    case "subscription.paused":
      tier = "premium";
      status = "past_due";
      break;
    case "subscription.cancelled":
    case "subscription.completed":
    case "subscription.expired":
      tier = "free";
      status = "canceled";
      break;
    default:
      return NextResponse.json({ ignored: true, reason: event });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert({
    user_id: userId,
    tier,
    status,
    provider: "razorpay",
    provider_subscription_id: subscription.id,
    current_period_end: subscription.current_end
      ? new Date(subscription.current_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    // 500 → Razorpay retries the delivery.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
