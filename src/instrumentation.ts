import { configWarnings } from "@/lib/startup";

/**
 * Runs once when a server instance starts, before it handles any request.
 *
 * The only thing here is a configuration check for settings that are optional
 * to the code and expensive to get wrong - the kind whose failure mode is a
 * larger bill rather than an error. Once per instance is the right cadence:
 * loud enough to see in the deploy log, quiet enough that it never becomes the
 * noise everyone scrolls past.
 *
 * Edge instances are skipped. `register` runs in both runtimes, and the checks
 * are about server-side jobs that only ever run in Node - warning twice, once
 * from a runtime that could not have done the work anyway, teaches people to
 * ignore it.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  for (const warning of configWarnings()) {
    console.warn(`[config] ${warning}`);
  }
}
