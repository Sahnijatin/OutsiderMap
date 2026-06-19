"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { confirmPremiumCheckout, startPremiumCheckout } from "./actions";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

function loadCheckoutScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay"));
    document.body.appendChild(script);
  });
}

export function SubscribeButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setPending(true);
    setError(null);
    try {
      const [{ subscriptionId }] = await Promise.all([
        startPremiumCheckout(),
        loadCheckoutScript(),
      ]);

      const razorpay = new window.Razorpay!({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        subscription_id: subscriptionId,
        name: "OutsiderMap",
        description: "Premium - weekend planning + underground access",
        theme: { color: "#f0a431" },
        modal: { ondismiss: () => setPending(false) },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await confirmPremiumCheckout({
              paymentId: response.razorpay_payment_id,
              subscriptionId: response.razorpay_subscription_id,
              signature: response.razorpay_signature,
            });
            router.push("/weekend");
            router.refresh();
          } catch {
            setError(
              "Payment went through but activation hiccuped. It will sort itself out in a minute - or write to us.",
            );
            setPending(false);
          }
        },
      });
      razorpay.open();
    } catch {
      setError("Couldn’t start checkout. Try again in a moment.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="under" size="lg" onClick={subscribe} disabled={pending}>
        {pending && <Spinner className="border-night/30 border-t-night" />}
        Go premium - ₹499/month
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
