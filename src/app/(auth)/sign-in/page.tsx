import type { Metadata } from "next";
import { SignInLanding } from "@/components/auth/sign-in-landing";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * The `?next=` return path the proxy redirects to. `/` renders the same
 * landing for signed-out visitors; both share SignInLanding so they cannot
 * drift.
 */
export default function SignInPage() {
  return <SignInLanding />;
}
