import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Share · OutsiderMap" };

/**
 * The composer surface: post about a real catalog place. Place-first, with
 * per-post visibility + location precision. Posts land pending review.
 */
export default async function ComposePage() {
  const profile = await requireOnboarded();
  return <Composer homeCity={profile.home_city ?? "delhi"} />;
}
