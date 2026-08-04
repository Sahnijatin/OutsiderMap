import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";
import { SignInLanding } from "@/components/auth/sign-in-landing";

/**
 * The front door is the sign-in screen (superseding #116, "the map for
 * everyone"): opening the app asks who you are first, matching what the native
 * shell already did via MobileAuthGate.
 *
 * Public surfaces are unchanged and still reachable directly - the map, place
 * pages, shared taste cards, and the marketing pages all stay outside
 * PROTECTED_PREFIXES, so links and search results keep working. "Look around
 * first" on the landing links straight to the map.
 *
 * This RENDERS the landing rather than redirecting to /sign-in on purpose:
 * robots.ts disallows /sign-in, so a redirect would point every crawler at a
 * blocked URL and take the root domain out of the index.
 */
export const metadata: Metadata = {
  title: "OutsiderMap - your city, your taste",
  description:
    "Hyper-personalised discovery for Delhi NCR. Tell us the mood; we already know your taste. One confident answer, never a chain.",
  alternates: { canonical: "/" },
};

/**
 * Explicitly dynamic, and load-bearing. getUser() returns early without
 * touching cookies() when Supabase env vars are absent, so a build without
 * them sees no dynamic API and prerenders this route - which would serve the
 * signed-out landing to everyone forever and never redirect a member to /map.
 * Don't rely on the env being present at build time to make this dynamic.
 */
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getOptionalUser();
  if (user) redirect("/map");
  return <SignInLanding />;
}
