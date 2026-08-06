"use client";

import { useEffect } from "react";
import { retryTourCompletion, syncTourEligibility } from "@/lib/tour/store";

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
    // A dismissal that happened offline still owes the server a write. This is
    // the natural place to settle it: it runs on every mount, and by definition
    // a mount means the app just loaded something over the network.
    retryTourCompletion();
  }, [eligible]);

  return null;
}
