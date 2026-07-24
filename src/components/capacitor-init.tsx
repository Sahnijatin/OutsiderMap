"use client";

import { useEffect } from "react";

/**
 * Native-shell setup for the Capacitor app (#143). Renders nothing on web: the
 * Capacitor modules are dynamically imported *inside* the effect and guarded by
 * `isNativePlatform()`, so they never enter the web bundle and this is a pure
 * no-op in the browser. On iOS/Android it styles the status bar for the dark
 * brand and dismisses the native splash once the app has painted.
 */
export function CapacitorInit() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (cancelled || !Capacitor.isNativePlatform()) return;

        const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
          import("@capacitor/status-bar"),
          import("@capacitor/splash-screen"),
        ]);

        // Light content over the near-black brand background; let the WebView
        // extend under the status bar (CSS safe-area insets own the padding).
        await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
        await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
        await SplashScreen.hide().catch(() => {});
      } catch {
        // Capacitor absent (plain web) or a plugin unavailable - ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
