import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { Screen } from "@/components/app/screen";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = { title: "Drop a spot" };

/**
 * The street-easy submission path (revives the retired member flow): a
 * Google Maps link OR just a name, optional comment, done. The scout
 * pipeline researches it; an admin verifies; then it's on the map.
 */
export default async function SubmitPage() {
  await requireOnboarded();
  return (
    <Screen width="narrow">
      <div className="relative">
        <div className="halo absolute -inset-10" />
        <h1 className="relative font-display text-3xl italic">Drop a spot.</h1>
        <p className="relative mt-2 max-w-md text-sm text-ink-dim">
          Know a place that belongs on the map? A Google Maps link or just the
          name is enough - we&rsquo;ll do the digging.
        </p>
      </div>
      <SubmitForm />
    </Screen>
  );
}
