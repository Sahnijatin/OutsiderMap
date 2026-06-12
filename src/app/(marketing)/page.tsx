import { ClosingCta } from "@/components/marketing/cta";
import { Demo } from "@/components/marketing/demo";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Premium } from "@/components/marketing/premium";

export default function LandingPage() {
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
