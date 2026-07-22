import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = { title: "Activity" };

/** The action stream — who did what to your stuff. Separate from the feed. */
export default async function ActivityPage() {
  await requireOnboarded();
  return <ActivityView />;
}
