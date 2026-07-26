// Injects the runtime permission declarations, versioning, entitlements, and
// URL schemes our Capacitor plugins need into the *generated* native projects.
// ios/ and android/ are created fresh in CI from capacitor.config.ts (they're
// git-ignored), so this can't be a committed hand-edit - run it after
// `npx cap sync`. Idempotent: re-running is a no-op.
//
//   node scripts/cap-native-permissions.mjs
//
// Env inputs (all optional):
//   ANDROID_VERSION_CODE            - Play versionCode (CI passes the run
//                                     number); the template's `versionCode 1`
//                                     is kept when unset.
//   NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID - when set, the reversed client id is
//                                     registered as a CFBundleURLScheme so the
//                                     native Google sign-in sheet can return
//                                     to the app. Skipped silently when unset
//                                     (unsigned CI builds stay green).
//
// Add a plugin's requirements to the tables below and all build workflows
// pick them up automatically.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const IOS_PLIST = "ios/App/App/Info.plist";
const IOS_PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj";
const IOS_ENTITLEMENTS = "ios/App/App/App.entitlements";
const ANDROID_MANIFEST = "android/app/src/main/AndroidManifest.xml";
const ANDROID_GRADLE = "android/app/build.gradle";

/** iOS usage-description strings (shown in the OS permission prompt). */
const IOS_USAGE_KEYS = {
  // @capacitor/geolocation - map "Near me" + on-site scout verification.
  NSLocationWhenInUseUsageDescription:
    "OutsiderMap uses your location to center the map on you and to verify spots you scout on-site.",
  // @capacitor/camera - live scout verification photos + feed posts.
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
  // Push notifications - runtime-prompted from Android 13 (API 33) on.
  "android.permission.POST_NOTIFICATIONS",
];

/**
 * iOS entitlements the app needs for its capabilities:
 *   - aps-environment: push notifications (@capacitor/push-notifications).
 *     "production" is correct for both TestFlight and App Store; Xcode swaps
 *     in "development" automatically for debug installs.
 *   - com.apple.developer.applesignin: Sign in with Apple
 *     (@capgo/capacitor-social-login).
 */
const IOS_ENTITLEMENTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
	<key>com.apple.developer.applesignin</key>
	<array>
		<string>Default</string>
	</array>
</dict>
</plist>
`;

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

/**
 * Write App.entitlements and point the App target's build configurations at it
 * (CODE_SIGN_ENTITLEMENTS). Without this, a signed build ships with push and
 * Sign in with Apple silently dead - the plugins load but the OS refuses both.
 */
function patchIosEntitlements() {
  if (!existsSync(IOS_PBXPROJ)) return "ios entitlements: skipped (no project)";

  const wrote =
    !existsSync(IOS_ENTITLEMENTS) ||
    readFileSync(IOS_ENTITLEMENTS, "utf8") !== IOS_ENTITLEMENTS_XML;
  if (wrote) writeFileSync(IOS_ENTITLEMENTS, IOS_ENTITLEMENTS_XML);

  let pbx = readFileSync(IOS_PBXPROJ, "utf8");
  if (pbx.includes("CODE_SIGN_ENTITLEMENTS")) {
    return wrote
      ? "ios entitlements: file refreshed (pbxproj already wired)"
      : "ios entitlements: already present";
  }

  // The App *target*'s Debug/Release blocks are the only buildSettings that
  // set INFOPLIST_FILE (the project-level blocks don't), so anchoring the
  // insertion there hits exactly the two blocks we need. CODE_SIGN_ENTITLEMENTS
  // is relative to the project directory (ios/App/), like INFOPLIST_FILE.
  const anchor = "INFOPLIST_FILE = App/Info.plist;";
  const count = pbx.split(anchor).length - 1;
  if (count !== 2) {
    throw new Error(
      `${IOS_PBXPROJ}: expected 2 App-target build configurations (found ${count}) - Capacitor template changed, update this script`,
    );
  }
  pbx = pbx.replaceAll(
    anchor,
    `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\t${anchor}`,
  );
  writeFileSync(IOS_PBXPROJ, pbx);
  return "ios entitlements: wrote App.entitlements + wired CODE_SIGN_ENTITLEMENTS (Debug, Release)";
}

/**
 * Register the reversed Google iOS client id as a CFBundleURLScheme so the
 * native Google sign-in flow can hand control back to the app. Only when
 * NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID is set - unsigned CI builds (no OAuth
 * config) skip this silently and stay green.
 */
function patchIosGoogleScheme() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!clientId) {
    return "ios google scheme: skipped (NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID unset)";
  }
  if (!existsSync(IOS_PLIST)) return "ios google scheme: skipped (no project)";

  // XXXX.apps.googleusercontent.com -> com.googleusercontent.apps.XXXX
  // (accept an already-reversed id too, in case the env var holds that form).
  const suffix = ".apps.googleusercontent.com";
  const reversed = clientId.startsWith("com.googleusercontent.apps.")
    ? clientId
    : clientId.endsWith(suffix)
      ? `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`
      : null;
  if (!reversed) {
    throw new Error(
      `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID does not look like a Google iOS client id: ${clientId}`,
    );
  }

  let plist = readFileSync(IOS_PLIST, "utf8");
  if (plist.includes(`<string>${reversed}</string>`)) {
    return "ios google scheme: already present";
  }

  const entry = `		<dict>
			<key>CFBundleURLName</key>
			<string>GoogleSignIn</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>${reversed}</string>
			</array>
		</dict>\n`;

  const typesKey = "<key>CFBundleURLTypes</key>";
  if (plist.includes(typesKey)) {
    // Append our entry to the existing CFBundleURLTypes array (a plugin may
    // have created it) rather than duplicating the key.
    const keyAt = plist.indexOf(typesKey);
    const arrayOpen = plist.indexOf("<array>", keyAt);
    if (arrayOpen === -1) {
      throw new Error(`${IOS_PLIST}: CFBundleURLTypes has no <array>`);
    }
    const insertAt = arrayOpen + "<array>".length;
    plist = `${plist.slice(0, insertAt)}\n${entry.replace(/\n$/, "")}${plist.slice(insertAt)}`;
  } else {
    const block = `	${typesKey}\n	<array>\n${entry}	</array>\n`;
    const close = plist.lastIndexOf("</dict>");
    if (close === -1) throw new Error(`${IOS_PLIST}: no closing </dict> found`);
    plist = plist.slice(0, close) + block + plist.slice(close);
  }
  writeFileSync(IOS_PLIST, plist);
  return `ios google scheme: added ${reversed}`;
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

/**
 * Stamp defaultConfig with a real versionCode/versionName. The Capacitor
 * template hardcodes `versionCode 1` and never reads Gradle -P properties, so
 * without this every Play upload after the first is rejected as a duplicate.
 * CI passes ANDROID_VERSION_CODE (the workflow run number); versionName comes
 * from package.json so the store listing tracks the app version.
 */
function patchAndroidVersion() {
  if (!existsSync(ANDROID_GRADLE)) return "android version: skipped (no project)";
  let gradle = readFileSync(ANDROID_GRADLE, "utf8");
  const applied = [];

  const rawCode = process.env.ANDROID_VERSION_CODE;
  if (rawCode) {
    if (!/^\d+$/.test(rawCode)) {
      throw new Error(`ANDROID_VERSION_CODE must be a positive integer, got: ${rawCode}`);
    }
    const next = gradle.replace(/versionCode\s+\d+/, `versionCode ${rawCode}`);
    if (next !== gradle) {
      gradle = next;
      applied.push(`versionCode ${rawCode}`);
    }
  }

  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  if (version) {
    const next = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);
    if (next !== gradle) {
      gradle = next;
      applied.push(`versionName "${version}"`);
    }
  }

  if (!applied.length) return "android version: already current";
  writeFileSync(ANDROID_GRADLE, gradle);
  return `android version: set ${applied.join(", ")}`;
}

console.log(patchIos());
console.log(patchIosEntitlements());
console.log(patchIosGoogleScheme());
console.log(patchAndroid());
console.log(patchAndroidVersion());
