# OutsiderMap — Mobile Plan

> The single source of truth for shipping OutsiderMap as native **iOS + Android**
> apps. Read this before touching anything mobile. Tracking issue: **#145**
> (this plan + the verify harness + the sequenced work).
>
> _Decision: wrap the existing Next.js web app with **Capacitor**. One
> TypeScript codebase → web, iOS, and Android. The old Expo/React-Native
> attempt (`mobile/`) has since been deleted - see §4._

---

## 1. The decision — Capacitor, not a native rebuild

The app is already mobile-shaped on the web (map-first, phone-style bottom tabs,
responsive shell). The mobile apps should **be that web app** in a native shell,
not a parallel rewrite.

| Option | Verdict |
|---|---|
| **Capacitor** — native shell around the web app | ✅ **Chosen.** One codebase, real store presence, native device APIs, 100% parity by construction, self-validatable (see §5). |
| Revive the Expo/RN app in `mobile/` | ❌ Partial + 5 SDK majors behind + predates the web shell (missing map/quests/reels/friends). Reviving = rebuild to parity **and** maintain two codebases forever. |
| Fresh React Native/Expo | ❌ Second codebase, permanent drift, new skillset, and I can't self-review it in this environment. |

**Language:** stays **TypeScript/React**. Capacitor generates the native iOS
(Swift/Xcode) and Android (Kotlin/Gradle) projects — you never write them.

**Trade-off (honest):** a webview app isn't as buttery as fully-native RN for the
heaviest interactions. For a map + content + chat app (not a game), with the perf
work in #127, it's excellent. RN would only win if we needed deep native
performance *and* were willing to maintain two codebases. We're not.

---

## 2. Architecture — Capacitor hybrid (keeps SSR/API intact)

The app is server-driven (server components via `requireOnboarded()`, `/api/*`
routes, SSR). A pure static export would break all of that, so:

- **Native shell loads the hosted web app** (production URL) → server
  components, API, and auth work unchanged. Near-zero refactor.
- **Native plugin layer** bridges device APIs into the same web UI.
- **Bundled offline/splash shell** — native splash, status bar, safe-area, and a
  real offline state (never a browser error page).

### Native plugin map
| Need | Plugin | Ties to |
|---|---|---|
| Push (APNs/FCM) | `@capacitor/push-notifications` | Proactive layer #125 |
| Location | `@capacitor/geolocation` | Entry/location #116 |
| Camera / media | `@capacitor/camera` | Scout #80, Feed #67, Moderation #70 |
| Haptics | `@capacitor/haptics` | brand feel |
| Share | `@capacitor/share` | Growth loops #123 |
| Status bar / splash | `@capacitor/status-bar`, `@capacitor/splash-screen` | craft |
| Deep / universal links | Capacitor app links | referral deep-links |
| Session storage | `@capacitor/preferences` | session persistence #116 |

### Apple 4.2 "minimum functionality"
Webview wrappers get rejected if they read as "just a website." We clear it with
genuine native value we need anyway: **push** (the strongest reviewer signal),
native geolocation, camera, haptics, and a real offline state.

---

## 3. Open mobile items & sequence

Mobile isn't one task — it's a native-packaging effort that rides on top of the
web epics. Build in this order:

### Phase 0 — Review loop (DONE ✅)
- **`mobile-verify/` Playwright harness** — reviews the web app at iPhone + Pixel
  viewports with mocked location, screenshots every surface, asserts
  mobile-health invariants. This is what makes ongoing mobile dev validatable
  without a device. `npm run mobile:verify`. See §5.

### Phase 1 — Mobile-web foundation (do first; benefits web too)
- **#127 — mobile-web craft**: 60fps map, small bundles, image optimization,
  **PWA/offline**, voice input, verified on real mid-range Android/4G. Capacitor
  and PWA share this exact foundation — harden it before wrapping.

### Phase 2 — Capacitor shell (#143)
1. Add Capacitor to the repo; configure the **hybrid shell** (loads hosted app) +
   splash/status-bar/safe-area + offline state.
2. Wire the **native plugins** (push, geolocation, camera, haptics, share,
   preferences) into the existing web flows.
3. **Sign in with Apple** on iOS (required when other social logins exist);
   Google native client IDs.
4. Deep/universal links for referral (#123).

### Phase 3 — Store readiness
- Apple Developer + Google Play accounts; bundle IDs `com.outsidermap.app`.
- iOS signing (certs/provisioning), Android keystore.
- Icons/splash (dark `#0c0a08`) — source art committed at `assets/`
  (`icon.png`, `splash.png`, `splash-dark.png`; regenerate with
  `node scripts/gen-mobile-icons.mjs`); every native workflow runs
  `npx capacitor-assets generate` after `cap sync`.
- **Privacy nutrition labels + data-safety form** (#129, #70): location, media,
  taste data.
- Pre-approved demo account; TestFlight / Play internal.
- CI: cloud native builds wired (§6) — Android debug APK on Linux + iOS
  compile-check on cloud macOS, no Mac needed.
  - **Signed iOS → TestFlight: `.github/workflows/ios-testflight.yml`** (wired,
    dormant). Cloud macOS build with App Store Connect **API-key automatic
    signing** — no Mac. Needs the one-time Apple setup + repo secrets
    `APP_STORE_CONNECT_API_KEY` / `_KEY_ID` / `_ISSUER_ID` and `APPLE_TEAM_ID`;
    fails fast with a clear message until they're set. Manual trigger. First live
    run will need signing-edge tuning.
  - **Signed Android → Play: `.github/workflows/android-release.yml`** (wired,
    dormant until the keystore secrets are set). Stamps a strictly increasing
    `versionCode` (the workflow run number) via
    `scripts/cap-native-permissions.mjs`.
  - The old RN Metro-bundle CI step is retired (§7 / Stage 7).

### Phase 4 — Native-only validation (needs a device/simulator)
- Real APNs/FCM push delivery, native camera, device GPS, haptics, signed store
  builds — the ~10% the harness can't cover (§5).

### Feature epics that light up on mobile automatically
Because it's one codebase, these ship to mobile the moment they ship to web —
no extra mobile work: #67 Feed, #68 Market intel, #69 Chat, #70 Moderation,
#80 Scout, #116 Entry, #120–#131. That's the whole point of the Capacitor choice.

---

## 4. The retired Expo app (deleted)

The Expo/React-Native attempt in `mobile/` (and its `docs/EXPO_SDK_MIGRATION*`
playbooks) has been **deleted** as part of the launch cleanup - it predated the
web shell, was five SDK majors behind, and nothing built it. The only salvage
worth keeping was the placeholder brand art, which is now regenerated by
`scripts/gen-mobile-icons.mjs` into the Capacitor source assets at `assets/`
(`icon.png`, `splash.png`, `splash-dark.png`). Its Skia ConvergenceField was a
simpler RN-only take on the web version
(`src/components/three/ConvergenceField.tsx`), which is the richer of the two -
nothing else was worth porting.

The shipping native builds are `android-build.yml` (debug APK),
`android-release.yml` (signed .aab/.apk), `ios-build-check.yml` (compile check)
and `ios-testflight.yml` (signed → TestFlight).

---

## 5. Self-validation — the `mobile-verify` harness

Because the mobile app **is** the web app in a webview, ~**90% of it is
reviewable without a device**: all UI, layout, gestures, flows, and functionality.

- **Run:** `npm run mobile:verify` (auto-starts `next dev`), or
  `MOBILE_VERIFY_URL=https://www.outsidermap.com npm run mobile:verify`.
- **What it does:** iPhone-14 + Pixel-7 viewports (iOS engine emulated on
  Chromium here; WebKit rendering still needs a device), Delhi geolocation
  mocked, every surface screenshotted to `mobile-verify/screenshots/`, and
  asserts: **no horizontal scroll**, **rendered (not blank/crashed)**, **no
  5xx**. Auth-gated routes that redirect to `/sign-in` are annotated, so the
  report doubles as a live map of what's reachable.
- **Surfaces:** landing, sign-in, onboarding, map, chat, reels, events, saved,
  profile (`SURFACES` in `flows.spec.ts` — add one line per surface).
- **Extend over time:** perf budgets (LCP/bundle) and throttled-network profiles
  as #127 lands; a signed-in `storageState` to exercise authed surfaces (see
  `mobile-verify/README.md` → Authed flows).

**Needs a device/simulator (the other ~10%):** real push, native camera, device
GPS, haptics, signed builds — the Phase 4 checklist.

---

## 6. Capacitor — scaffold (done) & cloud native builds (no Mac needed)

**Scaffolded in-repo (Phase 2a):**
- `capacitor.config.ts` — appId `com.outsidermap.app`; **hybrid** model: loads the
  hosted app via `CAP_SERVER_URL`; dark brand background; splash config;
  `server.errorPath` points load failures at the bundled offline page.
- `mobile-shell/index.html` — the `webDir` splash/offline fallback. Brand-styled,
  shows a real offline state (never a blank/browser-error screen → clears Apple 4.2).
  Wired up via `server.errorPath`, so an offline launch actually renders it.
- `scripts/cap-native-permissions.mjs` — post-`cap sync` patcher for the
  generated projects: iOS usage strings + **App.entitlements**
  (`aps-environment`, Sign in with Apple) wired into the Xcode build settings,
  the reversed Google iOS client id as a `CFBundleURLScheme` (only when
  `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set), Android manifest permissions, and
  Android `versionCode`/`versionName` (from `ANDROID_VERSION_CODE` +
  package.json).
- `src/components/capacitor-init.tsx` — native-only status-bar styling + splash
  dismiss, wired into the root layout. **No-op on web** (Capacitor is dynamically
  imported inside the effect, so it never enters the web bundle).
- Deps: `@capacitor/core` + `app`/`status-bar`/`splash-screen`, `@capacitor/cli`.

### Native projects are generated in the cloud, not committed (Phase 2b)

We build **fully in the cloud** — no Mac, no local Android SDK. Because this is a
Capacitor *hybrid* app (the native shell only loads the hosted web app), the
`ios/` and `android/` projects are **completely determined by
`capacitor.config.ts`**. So CI regenerates them fresh on every run instead of
committing them — that's why `/ios` and `/android` are git-ignored.

| Build | Runner | Workflow | Output | Needs |
|---|---|---|---|---|
| **Android debug APK** | Linux (`ubuntu-latest`) | `.github/workflows/android-build.yml` | sideloadable `app-debug.apk` artifact | nothing — free |
| **iOS compile check** | cloud macOS (`macos-15`) | `.github/workflows/ios-build-check.yml` | pass/fail "it compiles" (unsigned, no artifact) | nothing — free |
| **Android signed release** | Linux (`ubuntu-latest`) | `.github/workflows/android-release.yml` | signed `.aab` + `.apk` for Play | **upload keystore secrets** |
| **iOS signed / TestFlight** | cloud macOS (`macos-15`) | `.github/workflows/ios-testflight.yml` | `.ipa` → TestFlight | **Apple Developer acct ($99/yr) + ASC API-key secrets** |

Both workflows read the hybrid target URL from, in priority order: the **Run
workflow** input → the `CAP_SERVER_URL` repo variable → the production URL
fallback. Set the `CAP_SERVER_URL` repo variable (Settings → Secrets and
variables → Actions → Variables) to your staging/production URL so manual runs
need no input.

- **Android APK** runs on manual dispatch and on `main` pushes that touch the
  shell/config — download the artifact, sideload it, and you're testing the real
  native shell on a device. This is the immediate "installable app" path.
- **iOS compile check** is manual-only (macOS runner minutes cost ~10×). It
  proves the iOS shell links and builds; it does **not** produce anything
  installable — that requires signing (Phase 3).

To reproduce locally *if you ever get a Mac* (optional — CI does all of this):
```bash
export CAP_SERVER_URL=https://<staging>.vercel.app
npx cap add ios && npx cap add android && npx cap sync
npx cap open ios     # → Xcode      ·  npx cap open android → Android Studio
```

**Then, in order (error-free):**
1. Launch in iOS simulator + Android emulator — hosted app loads, no white flash,
   safe-areas correct, cookies/session persist in the WebView.
2. **In-app sign-in (the #1 breaker) — code done, needs config to activate.**
   Google forbids embedded-WebView OAuth, so native sign-in never uses the
   WebView or a browser:
   - **Email code** — fully in-app, works today. The native app opens straight to
     the sign-in screen (`MobileAuthGate`, #149 / #150).
   - **Apple + Google sheets** — OS-native account pickers via
     `@capgo/capacitor-social-login` → Supabase `signInWithIdToken` (#151,
     `src/lib/auth/native-social.ts`). **Gated on config**: the buttons appear
     only when the client IDs below are set, so nothing broken ships.
   - **To activate (one-time):**
     - Google Cloud: iOS + Web OAuth client IDs → set `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`
       and `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` on the hosting deploy.
     - Supabase → Auth → Providers: enable Google + Apple, add the client IDs to
       the allowed audiences.
     - iOS Google (signed device build): done in code —
       `scripts/cap-native-permissions.mjs` injects the reversed-client-id as a
       `CFBundleURLScheme` into the generated `Info.plist` whenever
       `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set in the build env (skipped
       silently otherwise, so the unsigned CI build stays green without it).
     - Apple: needs the Apple Developer account + the "Sign in with Apple"
       capability on the iOS target (signed builds); set `NEXT_PUBLIC_APPLE_SIGN_IN=1`.
   - Verify by sideloading the APK (device-only; the harness can't cover native
     SDK sheets — §5).
3. Plugins one at a time, each device-verified:
   - **geolocation — code done.** `@capacitor/geolocation` behind a shared seam
     (`src/lib/map/geolocation.ts`): the map's "Near me" + auto-locate and the
     scout submit/confirm flows use native GPS in the app, `navigator.geolocation`
     on the web (unchanged). iOS `NSLocationWhenInUseUsageDescription` + Android
     `ACCESS_*_LOCATION` injected into the generated projects by
     `scripts/cap-native-permissions.mjs` (run after `cap sync` in both builds).
     Device-verify by sideloading the APK.
   - **camera — code done.** `@capacitor/camera` behind `src/lib/media/camera.ts`
     (returns a plain `File`). Scout verification forces a **live** camera shot on
     native (no gallery pick — integrity for #80); the composer gains an additive
     Camera tile. Web file inputs unchanged.
   - **share + haptics — code done.** `src/lib/native/share.ts` (native sheet →
     Web Share → clipboard; fixes share silently degrading to clipboard in the
     Android WebView) and `src/lib/native/haptics.ts` (tap/success/warn, never
     throwing), wired sparingly.
   - **push — client code done, dormant until credentials.**
     `src/lib/native/push.ts` + `<PushRegistrar>` request permission, register,
     and POST the token to the existing `/api/notifications/token`; taps deep-link
     via `data.url`; sign-out releases the token. **To activate delivery:** an
     **APNs key** + the Push Notifications capability (iOS) and
     **`google-services.json`** (Android, FCM). Capacitor only applies the
     google-services gradle plugin when that file exists, so builds stay green
     without it. The sender itself is still deferred (#125) —
     `lib/notifications/frequency.ts` holds the send rules.
4. Store readiness — signing, icons/splash, privacy labels (#129/#70),
   TestFlight / Play internal.

---

## 7. TL;DR

One TypeScript codebase. Capacitor wraps the hosted web app + native plugins.
The Expo app is deleted. Harden the web foundation (#127), add the Capacitor shell
(#143), get store-ready, validate the native 10% on a device — and review
everything else continuously with `npm run mobile:verify`.
