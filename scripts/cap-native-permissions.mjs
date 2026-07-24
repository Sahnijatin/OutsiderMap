// Injects the location permission declarations the @capacitor/geolocation plugin
// needs at runtime into the *generated* native projects. ios/ and android/ are
// created fresh in CI from capacitor.config.ts (they're git-ignored), so this
// can't be a committed hand-edit — run it after `npx cap sync`. Idempotent.
//
//   node scripts/cap-native-permissions.mjs
//
// iOS  → NSLocationWhenInUseUsageDescription (why we ask; when-in-use only).
// Android → ACCESS_COARSE_LOCATION + ACCESS_FINE_LOCATION (fine is needed for
//           enableHighAccuracy, which the map + scout flows request).

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const IOS_PLIST = "ios/App/App/Info.plist";
const ANDROID_MANIFEST = "android/app/src/main/AndroidManifest.xml";

const IOS_USAGE =
  "OutsiderMap uses your location to center the map on you and to verify spots you scout on-site.";

function patchIos() {
  if (!existsSync(IOS_PLIST)) return "ios: skipped (no project)";
  let plist = readFileSync(IOS_PLIST, "utf8");
  if (plist.includes("NSLocationWhenInUseUsageDescription")) {
    return "ios: already present";
  }
  const block = `	<key>NSLocationWhenInUseUsageDescription</key>
	<string>${IOS_USAGE}</string>
`;
  const close = plist.lastIndexOf("</dict>");
  if (close === -1) throw new Error(`${IOS_PLIST}: no closing </dict> found`);
  plist = plist.slice(0, close) + block + plist.slice(close);
  writeFileSync(IOS_PLIST, plist);
  return "ios: added NSLocationWhenInUseUsageDescription";
}

function patchAndroid() {
  if (!existsSync(ANDROID_MANIFEST)) return "android: skipped (no project)";
  let manifest = readFileSync(ANDROID_MANIFEST, "utf8");
  if (manifest.includes("ACCESS_FINE_LOCATION")) {
    return "android: already present";
  }
  const perms =
    `    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n` +
    `    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n`;
  // Insert before the closing </manifest> tag.
  const close = manifest.lastIndexOf("</manifest>");
  if (close === -1) throw new Error(`${ANDROID_MANIFEST}: no </manifest> found`);
  manifest = manifest.slice(0, close) + perms + manifest.slice(close);
  writeFileSync(ANDROID_MANIFEST, manifest);
  return "android: added location permissions";
}

console.log(patchIos());
console.log(patchAndroid());
