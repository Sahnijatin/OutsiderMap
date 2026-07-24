"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny client-side store for "which Capacitor platform are we on" — `"web"`,
 * `"ios"`, or `"android"`. Used to gate native-only behaviour (the mobile app
 * opens to a sign-in screen, and native sign-in stays fully in-app — #149).
 *
 * Capacitor is imported *dynamically* so it never enters the web bundle, and the
 * value is exposed through `useSyncExternalStore` (not set-state-in-effect), so
 * SSR/first paint is deterministically `"web"` and it upgrades once detection
 * resolves on a device.
 */

export type CapacitorPlatform = "web" | "ios" | "android";

let platform: CapacitorPlatform = "web";
let started = false;
const listeners = new Set<() => void>();

function startDetection() {
  if (started) return;
  started = true;
  void (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      const p = Capacitor.getPlatform();
      if (p === "ios" || p === "android") {
        platform = p;
        for (const l of listeners) l();
      }
    } catch {
      // Capacitor absent (plain web) — stay "web".
    }
  })();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  startDetection();
  return () => {
    listeners.delete(onChange);
  };
}

const getSnapshot = () => platform;
// Server + first client render agree on "web" (no hydration mismatch).
const getServerSnapshot = () => "web" as const;

/** The current Capacitor platform. `"web"` until native detection resolves. */
export function useCapacitorPlatform(): CapacitorPlatform {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True on a native iOS/Android shell; false on the web. */
export function useIsNativeApp(): boolean {
  return useCapacitorPlatform() !== "web";
}
