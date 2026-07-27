"use client";

import { isNativeApp } from "@/lib/capacitor/platform";
import { getSoundPrefs } from "@/lib/sound/prefs";

/**
 * Haptic feedback (#143 plugins track) - the small physical confirmations that
 * make the app feel native rather than like a website in a frame.
 *
 * Every helper is **fire-and-forget and never throws**: haptics are a nicety,
 * so a missing plugin, a device without a taptic engine, or a denied capability
 * must never affect a user flow. All are no-ops on the web.
 *
 * Used sparingly and only on meaningful moments - a buzz on every tap is noise.
 */

type Impact = "light" | "medium" | "heavy";

async function withHaptics<T>(
  run: (m: typeof import("@capacitor/haptics")) => Promise<T>,
): Promise<void> {
  try {
    // Respect the "Feel" setting - members can switch haptics off entirely.
    if (!getSoundPrefs().haptics) return;
    if (!(await isNativeApp())) return;
    const mod = await import("@capacitor/haptics");
    await run(mod);
  } catch {
    // Never let feedback break a flow.
  }
}

/** A tap - for a deliberate action (button press, capture). */
export function tap(style: Impact = "light"): void {
  void withHaptics(async ({ Haptics, ImpactStyle }) => {
    const map = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    } as const;
    await Haptics.impact({ style: map[style] });
  });
}

/** A completion buzz - for something that succeeded (submitted, verified). */
export function success(): void {
  void withHaptics(async ({ Haptics, NotificationType }) => {
    await Haptics.notification({ type: NotificationType.Success });
  });
}

/** A rejection buzz - for something that failed or was refused. */
export function warn(): void {
  void withHaptics(async ({ Haptics, NotificationType }) => {
    await Haptics.notification({ type: NotificationType.Warning });
  });
}
