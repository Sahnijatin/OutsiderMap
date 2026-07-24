import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the OutsiderMap iOS + Android apps (see MOBILE_PLAN.md).
 *
 * HYBRID model: the native shell loads the *hosted* Next.js app, so server
 * components, `/api/*`, and auth all work unchanged. `webDir` (`mobile-shell/`)
 * is only the splash/offline fallback shown before the remote app paints or
 * when there's no network.
 *
 * Point the shell at an environment per build (never commit a URL here):
 *   CAP_SERVER_URL=https://<staging>.vercel.app npx cap sync
 * Leave CAP_SERVER_URL unset to build against the bundled shell only.
 *
 * Native projects (ios/ + android/) are generated on a Mac / with the Android
 * SDK via `npx cap add ios|android` — see MOBILE_PLAN.md § Capacitor setup.
 */
const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.outsidermap.app",
  appName: "OutsiderMap",
  webDir: "mobile-shell",
  // Warm brand-black behind the WebView so there's no white flash on launch
  // or during navigation (brand token --color-night).
  backgroundColor: "#0c0a08",
  ...(serverUrl ? { server: { url: serverUrl, cleartext: false } } : {}),
  ios: {
    backgroundColor: "#0c0a08",
    // Let CSS env(safe-area-inset-*) own the insets (already wired in
    // globals.css) rather than Capacitor padding the WebView.
    contentInset: "never",
  },
  android: {
    backgroundColor: "#0c0a08",
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#0c0a08",
      showSpinner: false,
      launchAutoHide: false, // we hide it from CapacitorInit once the app is up
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
