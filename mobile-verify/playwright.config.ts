import { defineConfig, devices } from "@playwright/test";

/**
 * Mobile-verify harness - reviews the web app at real phone viewports, exactly
 * as the Capacitor native shell (issue #143) will render it. This is the mobile
 * analogue of the web review loop: boot the app, drive the key flows on iPhone
 * and Pixel viewports with mocked location, screenshot everything, and assert
 * mobile-health invariants (no horizontal scroll, real content, no crash).
 *
 * Run:  npm run mobile:verify           (auto-starts `next dev` if needed)
 *       MOBILE_VERIFY_URL=https://www.outsidermap.com npm run mobile:verify
 *
 * Chromium is pre-installed in this environment; we point at it directly so the
 * harness never tries to download a browser. Override with PW_CHROME if needed.
 */

// Point at a specific Chromium (e.g. a pre-provisioned one) via PW_CHROME.
// Unset → Playwright's managed browser (`npx playwright install chromium`),
// which is what CI uses.
const CHROME = process.env.PW_CHROME;

// Vercel deployment-protection bypass, so CI can reach a protected preview.
const BYPASS = process.env.PW_BYPASS_TOKEN;

const BASE_URL = process.env.MOBILE_VERIFY_URL ?? "http://localhost:3000";

// Opt-in proxy for running the harness from behind an egress proxy (e.g. a
// sandboxed CI/agent). Set PW_PROXY to the proxy URL; TLS is interception-based
// there, so we relax cert checks only when proxying. Off by default.
const PROXY = process.env.PW_PROXY;

// Delhi - the launch city. Every flow runs as if the member is standing in the
// city so location-dependent surfaces (map, "right now") behave realistically.
const DELHI = { latitude: 28.6139, longitude: 77.209 };

export default defineConfig({
  testDir: ".",
  testMatch: /\.spec\.ts$/,
  outputDir: "./.artifacts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./report", open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    geolocation: DELHI,
    permissions: ["geolocation"],
    screenshot: "on",
    trace: "retain-on-failure",
    ...(PROXY ? { proxy: { server: PROXY }, ignoreHTTPSErrors: true } : {}),
    ...(BYPASS
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": BYPASS,
            "x-vercel-set-bypass-cookie": "true",
          },
        }
      : {}),
    // --no-sandbox: containers/CI often run as root, where Chromium refuses to
    // start without it. Harmless locally.
    launchOptions: {
      ...(CHROME ? { executablePath: CHROME } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  },
  projects: [
    // iPhone-14 viewport/UA/touch emulated on Chromium. iOS ships WebKit
    // (WKWebView), which isn't installed in this environment; Chromium device
    // emulation reviews layout/flows/overflow faithfully. Engine-specific iOS
    // rendering still needs a real device/simulator (see #143 device checklist).
    {
      name: "iphone",
      use: { ...devices["iPhone 14"], defaultBrowserType: "chromium" },
    },
    { name: "pixel", use: { ...devices["Pixel 7"] } },
  ],
  // Auto-start the app for local runs; reuse an already-running server (and any
  // remote MOBILE_VERIFY_URL) instead of spawning one.
  webServer: process.env.MOBILE_VERIFY_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
