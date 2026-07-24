import type { Metadata } from "next";
import { ClosingCta } from "@/components/marketing/cta";
import { Demo } from "@/components/marketing/demo";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Premium } from "@/components/marketing/premium";

export const metadata: Metadata = {
  title: "About",
  description:
    "OutsiderMap reads your taste and answers the only question that matters: where should I go, right now?",
};

/**
 * The brand story (#116): the map is the front door now, so the pitch lives
 * here - crawlable, linkable, and kept, not deleted. Anyone can read it.
 */
export default function AboutPage() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <Demo />
      <Premium />
      <ClosingCta />
    </main>
  );
}
