"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  cancelSubscription,
  createSubscription,
  verifyCheckoutSignature,
} from "@/lib/razorpay/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Step 1 of checkout: create the subscription Checkout will collect on. */
export async function startPremiumCheckout() {
  const user = await requireUser();
  const subscription = await createSubscription(user.id);
  return { subscriptionId: subscription.id };
}

const ConfirmSchema = z.object({
  paymentId: z.string().min(1),
  subscriptionId: z.string().min(1),
  signature: z.string().min(1),
});

/**
 * Step 2: Checkout succeeded client-side. Verify the signature and activate
 * provisionally - the webhook remains the source of truth and will land
 * with exact period dates.
 */
export async function confirmPremiumCheckout(input: z.infer<typeof ConfirmSchema>) {
  const user = await requireUser();
  const { paymentId, subscriptionId, signature } = ConfirmSchema.parse(input);

  if (!verifyCheckoutSignature(paymentId, subscriptionId, signature)) {
    throw new Error("Payment signature did not verify");
  }

  const admin = createAdminClient();
  const provisionalEnd = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
  const { error } = await admin.from("subscriptions").upsert({
    user_id: user.id,
    tier: "premium",
    status: "active",
    provider: "razorpay",
    provider_subscription_id: subscriptionId,
    current_period_end: provisionalEnd.toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Cancels at cycle end; access continues until current_period_end. */
export async function cancelPremium() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("provider_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!subscription?.provider_subscription_id) {
    throw new Error("No active subscription found");
  }
  await cancelSubscription(subscription.provider_subscription_id);
  // The cancellation webhook flips the row when the cycle actually ends.
}
