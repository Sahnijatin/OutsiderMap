"use client";

import { useEffect } from "react";

/**
 * Native-shell setup for the Capacitor app (#143). Renders nothing on web: the
 * Capacitor modules are dynamically imported *inside* the effect and guarded by
 * `isNativePlatform()`, so they never enter the web bundle and this is a pure
 * no-op in the browser. On iOS/Android it styles the status bar for the dark
 * brand, dismisses the native splash once the app has painted, and wires the
 * Android hardware back button to WebView history.
 */
export function CapacitorInit() {
  useEffect(() => {
    let cancelled = false;
    let backListener: { remove: () => Promise<void> } | null = null;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (cancelled || !Capacitor.isNativePlatform()) return;

        const [{ StatusBar, Style }, { SplashScreen }, { App }] =
          await Promise.all([
            import("@capacitor/status-bar"),
            import("@capacitor/splash-screen"),
            import("@capacitor/app"),
          ]);

        // Light content over the near-black brand background; let the WebView
        // extend under the status bar (CSS safe-area insets own the padding).
        await StatusBar.setStyle({ style: Style.Light }).catch(() => {});
        await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
        await SplashScreen.hide().catch(() => {});

        // Android hardware back: step back through the WebView history when
        // there is one; at the root, minimize instead of letting the OS kill
        // the activity (standard Android home-screen behavior).
        backListener = await App.addListener("backButton", () => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            App.minimizeApp().catch(() => {});
          }
        }).catch(() => null);
        if (cancelled) {
          backListener?.remove().catch(() => {});
          backListener = null;
        }
      } catch {
        // Capacitor absent (plain web) or a plugin unavailable - ignore.
      }
    })();
    return () => {
      cancelled = true;
      backListener?.remove().catch(() => {});
    };
  }, []);

  return null;
}
