"use client";

import { useEffect } from "react";
import { syncTourEligibility } from "@/lib/tour/store";

/**
 * Renders nothing. Its only job is to tell the module-level tour store what the
 * server knows: whether this member is owed the first-run walkthrough.
 *
 * Mounted in both (public) and (shell) layouts, which means it unmounts and
 * remounts every time the tour crosses that boundary - which is precisely why
 * the state itself lives outside React. syncTourEligibility is idempotent, so
 * the remount (and StrictMode's double-invoke) costs nothing.
 */
export function TourArm({ eligible }: { eligible: boolean }) {
  useEffect(() => {
    syncTourEligibility(eligible);
  }, [eligible]);

  return null;
}
