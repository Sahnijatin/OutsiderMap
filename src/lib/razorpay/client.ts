import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Minimal Razorpay REST client - subscriptions only. Razorpay over Stripe
 * because UPI + UPI Autopay mandates are non-negotiable for Indian consumer
 * subscriptions. No SDK: it's three endpoints and an HMAC.
 */

const API_BASE = "https://api.razorpay.com/v1";

function authHeader() {
  const env = serverEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys are not configured");
  }
  const token = Buffer.from(
    `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  return `Basic ${token}`;
}

async function razorpay<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Razorpay ${path} failed (${response.status}): ${detail}`);
  }
  return response.json() as Promise<T>;
}

export type RazorpaySubscription = {
  id: string;
  status: string;
  current_end: number | null;
  notes?: Record<string, string>;
};

/**
 * Creates a premium subscription for a user. notes.user_id is how the
 * webhook maps Razorpay events back to our user.
 */
export async function createSubscription(userId: string) {
  const env = serverEnv();
  if (!env.RAZORPAY_PREMIUM_PLAN_ID) {
    throw new Error("RAZORPAY_PREMIUM_PLAN_ID is not configured");
  }
  return razorpay<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: {
      plan_id: env.RAZORPAY_PREMIUM_PLAN_ID,
      total_count: 60, // monthly; UPI Autopay mandates need a finite count
      customer_notify: 1,
      notes: { user_id: userId },
    },
  });
}

/** Cancels at the end of the current billing cycle. */
export async function cancelSubscription(subscriptionId: string) {
  return razorpay<RazorpaySubscription>(
    `/subscriptions/${subscriptionId}/cancel`,
    { method: "POST", body: { cancel_at_cycle_end: 1 } },
  );
}

function safeEqualHex(a: string, b: string) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Verifies the x-razorpay-signature header on a webhook body. */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = serverEnv().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Verifies the signature Checkout hands back after a subscription auth. */
export function verifyCheckoutSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
) {
  const secret = serverEnv().RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  return safeEqualHex(expected, signature);
}
