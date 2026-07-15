import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { ClosingCta } from "@/components/marketing/cta";
import { Demo } from "@/components/marketing/demo";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Premium } from "@/components/marketing/premium";

export default async function LandingPage() {
  // Members skip the pitch: the map is the front door.
  const user = await getUser();
  if (user) redirect("/map");

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
