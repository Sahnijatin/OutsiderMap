// Injects the runtime permission declarations our Capacitor plugins need into
// the *generated* native projects. ios/ and android/ are created fresh in CI
// from capacitor.config.ts (they're git-ignored), so this can't be a committed
// hand-edit — run it after `npx cap sync`. Idempotent: re-running is a no-op.
//
//   node scripts/cap-native-permissions.mjs
//
// Add a plugin's requirements to the two tables below and both build workflows
// pick them up automatically.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const IOS_PLIST = "ios/App/App/Info.plist";
const ANDROID_MANIFEST = "android/app/src/main/AndroidManifest.xml";

/** iOS usage-description strings (shown in the OS permission prompt). */
const IOS_USAGE_KEYS = {
  // @capacitor/geolocation — map "Near me" + on-site scout verification.
  NSLocationWhenInUseUsageDescription:
    "OutsiderMap uses your location to center the map on you and to verify spots you scout on-site.",
  // @capacitor/camera — live scout verification photos + feed posts.
  NSCameraUsageDescription:
    "OutsiderMap uses the camera so you can verify spots on-site and add photos to your posts.",
  NSPhotoLibraryUsageDescription:
    "OutsiderMap needs your photo library so you can add photos to your posts.",
};

/** Android manifest permissions. */
const ANDROID_PERMISSIONS = [
  // Geolocation (fine is required for enableHighAccuracy).
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  // Camera + reading picked media (READ_MEDIA_IMAGES is the API 33+ form).
  "android.permission.CAMERA",
  "android.permission.READ_MEDIA_IMAGES",
  // Push notifications — runtime-prompted from Android 13 (API 33) on.
  "android.permission.POST_NOTIFICATIONS",
];

function patchIos() {
  if (!existsSync(IOS_PLIST)) return "ios: skipped (no project)";
  let plist = readFileSync(IOS_PLIST, "utf8");
  const added = [];
  for (const [key, value] of Object.entries(IOS_USAGE_KEYS)) {
    if (plist.includes(`<key>${key}</key>`)) continue;
    const block = `	<key>${key}</key>\n	<string>${value}</string>\n`;
    const close = plist.lastIndexOf("</dict>");
    if (close === -1) throw new Error(`${IOS_PLIST}: no closing </dict> found`);
    plist = plist.slice(0, close) + block + plist.slice(close);
    added.push(key);
  }
  if (!added.length) return "ios: already present";
  writeFileSync(IOS_PLIST, plist);
  return `ios: added ${added.join(", ")}`;
}

function patchAndroid() {
  if (!existsSync(ANDROID_MANIFEST)) return "android: skipped (no project)";
  let manifest = readFileSync(ANDROID_MANIFEST, "utf8");
  const missing = ANDROID_PERMISSIONS.filter(
    (p) => !manifest.includes(`android:name="${p}"`),
  );
  if (!missing.length) return "android: already present";

  const block = missing
    .map((p) => `    <uses-permission android:name="${p}" />\n`)
    .join("");
  const close = manifest.lastIndexOf("</manifest>");
  if (close === -1) throw new Error(`${ANDROID_MANIFEST}: no </manifest> found`);
  manifest = manifest.slice(0, close) + block + manifest.slice(close);
  writeFileSync(ANDROID_MANIFEST, manifest);
  return `android: added ${missing.length} permission(s)`;
}

console.log(patchIos());
console.log(patchAndroid());
